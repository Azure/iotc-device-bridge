/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const crypto = require('crypto');
const fetch = require('node-fetch');
const Device = require('azure-iot-device');
const DeviceTransport = require('azure-iot-device-http');

const StatusError = require('../error').StatusError;

const registrationHost = 'global.azure-devices-provisioning.net';
const registrationSasTtl = 3600; // 1 hour
const registrationApiVersion = `2019-03-31`;
const registrationStatusQueryAttempts = 10;
const registrationStatusQueryTimeout = 2000;
const minDeviceRegistrationTimeout = 60 * 1000; // 1 minute

const deviceCache = {};

/**
 * Forwards external telemetry messages for IoT Central devices.
 * @param {{ idScope: string, primaryKeyUrl: string, log: Function, getSecret: (context: Object, secretUrl: string) => string }} context 
 * @param {{ deviceId: string }} device 
 * @param {{ [field: string]: number }} measurements 
 */
module.exports = async function (context, device, measurements, timestamp) {
    if (device) {
        if (!device.deviceId || !/^[a-zA-Z0-9-._:]*[a-zA-Z0-9-]+$/.test(device.deviceId)) {
            throw new StatusError("Invalid format: deviceId must be alphanumeric and may contain '-', '.', '_', ':'. Last character must be alphanumeric or hyphen.", 400);
        }
    } else {
        // throw new StatusError('Invalid format: a device specification must be provided.', 400);
        const https = require('https')
        var os = require("os");
        var hostname = os.hostname();

        const data = {
            "displayName": "",
            "template": "",
            "simulated": false,
            "enabled": false
        }
        function createDevice(displayName, template, simulated, enabled) {
            data.displayName = displayName;
            data.template = template;
            data.simulated = simulated;
            data.enabled = enabled;
        }

        createDevice("CheckoutThermostatccc", "urn:kmwga2re7:modelDefinition:t_cj5wspyv", true, true)

        console.log(data)



        const options = {
            hostname: hostname,
            path: 'https://appsubdomain.azureiotcentral.com/api/devices/ccc?api-version=1.0',
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                //'Content-Length': data.length
            }
        }

        const req = https.request(options, res => {
            console.log(res.statusCode)

            res.on('data', d => {
                process.stdout.write(d)
            })
        })

        req.on('error', error => {
            console.error(error)
        })

        req.write(data.toString())
        req.end()
    }

    if (!validateMeasurements(measurements)) {
        throw new StatusError('Invalid format: invalid measurement list.', 400);
    }

    if (timestamp && isNaN(Date.parse(timestamp))) {
        throw new StatusError('Invalid format: if present, timestamp must be in ISO format (e.g., YYYY-MM-DDTHH:mm:ss.sssZ)', 400);
    }

    const client = Device.Client.fromConnectionString(await getDeviceConnectionString(context, device), DeviceTransport.Http);

    try {
        const message = new Device.Message(JSON.stringify(measurements));
        message.contentEncoding = 'utf-8';
        message.contentType = 'application/json';

        if (timestamp) {
            message.properties.add('iothub-creation-time-utc', timestamp);
        }

        await client.open();
        context.log('[HTTP] Sending telemetry for device', device.deviceId);
        await client.sendEvent(message);
        await client.close();
    } catch (e) {
        // If the device was deleted, we remove its cached connection string
        if (e.name === 'DeviceNotFoundError' && deviceCache[device.deviceId]) {
            delete deviceCache[device.deviceId].connectionString;
        }

        throw new Error(`Unable to send telemetry for device ${device.deviceId}: ${e.message}`);
    }
};

/**
 * @returns true if measurements object is valid, i.e., a map of field names to numbers or strings.
 */
function validateMeasurements(measurements) {
    if (!measurements || typeof measurements !== 'object') {
        return false;
    }

    return true;
}

async function getDeviceConnectionString(context, device) {
    const deviceId = device.deviceId;

    if (deviceCache[deviceId] && deviceCache[deviceId].connectionString) {
        return deviceCache[deviceId].connectionString;
    }

    const connStr = `HostName=${await getDeviceHub(context, device)};DeviceId=${deviceId};SharedAccessKey=${await getDeviceKey(context, deviceId)}`;
    deviceCache[deviceId].connectionString = connStr;
    return connStr;
}

/**
 * Registers this device with DPS, returning the IoT Hub assigned to it.
 */
async function getDeviceHub(context, device) {
    const deviceId = device.deviceId;
    const now = Date.now();

    // A 1 minute backoff is enforced for registration attempts, to prevent unauthorized devices
    // from trying to re-register too often.
    if (deviceCache[deviceId] && deviceCache[deviceId].lasRegisterAttempt && (now - deviceCache[deviceId].lasRegisterAttempt) < minDeviceRegistrationTimeout) {
        const backoff = Math.floor((minDeviceRegistrationTimeout - (now - deviceCache[deviceId].lasRegisterAttempt)) / 1000);
        throw new StatusError(`Unable to register device ${deviceId}. Minimum registration timeout not yet exceeded. Please try again in ${backoff} seconds`, 403);
    }

    deviceCache[deviceId] = {
        ...deviceCache[deviceId],
        lasRegisterAttempt: Date.now()
    }

    const sasToken = await getRegistrationSasToken(context, deviceId);

    url = `https://${registrationHost}/${context.idScope}/registrations/${deviceId}/register?api-version=${registrationApiVersion}`;
    const registrationOptions = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: sasToken },
        body: JSON.stringify({ registrationId: deviceId, payload: { iotcModelId: device.modelId } })
    };

    try {
        context.log('[HTTP] Initiating device registration');
        const response = await fetch(url, registrationOptions).then(res => res.json());

        if (response.status !== 'assigning' || !response.operationId) {
            throw new Error('Unknown server response');
        }

        url = `https://${registrationHost}/${context.idScope}/registrations/${deviceId}/operations/${response.operationId}?api-version=${registrationApiVersion}`;
        const statusOptions = {
            method: 'GET',
            headers: { Authorization: sasToken }
        };

        // The first registration call starts the process, we then query the registration status
        // every 2 seconds, up to 10 times.
        for (let i = 0; i < registrationStatusQueryAttempts; ++i) {
            await new Promise(resolve => setTimeout(resolve, registrationStatusQueryTimeout));

            context.log('[HTTP] Querying device registration status');
            const statusResponse = await fetch(url, statusOptions).then(res => res.json());

            if (statusResponse.status === 'assigning') {
                continue;
            } else if (statusResponse.status === 'assigned' && statusResponse.registrationState && statusResponse.registrationState.assignedHub) {
                return statusResponse.registrationState.assignedHub;
            } else if (statusResponse.status === 'failed' && statusResponse.registrationState && statusResponse.registrationState.errorCode === 400209) {
                throw new StatusError('The device may be unassociated or blocked', 403);
            } else {
                throw new Error('Unknown server response');
            }
        }

        throw new Error('Registration was not successful after maximum number of attempts');
    } catch (e) {
        throw new StatusError(`Unable to register device ${deviceId}: ${e.message}`, e.statusCode);
    }
}

async function getRegistrationSasToken(context, deviceId) {
    const uri = encodeURIComponent(`${context.idScope}/registrations/${deviceId}`);
    const ttl = Math.round(Date.now() / 1000) + registrationSasTtl;
    const signature = crypto.createHmac('sha256', new Buffer(await getDeviceKey(context, deviceId), 'base64'))
        .update(`${uri}\n${ttl}`)
        .digest('base64');
    return `SharedAccessSignature sr=${uri}&sig=${encodeURIComponent(signature)}&skn=registration&se=${ttl}`;
}

/**
 * Computes a derived device key using the primary key.
 */
async function getDeviceKey(context, deviceId) {
    if (deviceCache[deviceId] && deviceCache[deviceId].deviceKey) {
        return deviceCache[deviceId].deviceKey;
    }

    const key = crypto.createHmac('SHA256', Buffer.from(await context.getSecret(context, context.primaryKeyUrl), 'base64'))
        .update(deviceId)
        .digest()
        .toString('base64');

    deviceCache[deviceId].deviceKey = key;
    return key;
}
