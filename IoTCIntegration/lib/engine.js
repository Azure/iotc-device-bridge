const crypto = require('crypto');
const request = require('request-promise-native');
const Device = require('azure-iot-device');
const DeviceTransport = require('azure-iot-device-http');

const registrationHost = 'global.azure-devices-provisioning.net';
const registrationSasTtl = 3600; // 1 hour
const registrationApiVersion = `2018-09-01-preview`;
const registrationRetryTimeouts = [500, 1000, 2000, 4000];
const minDeviceRegistrationTimeout = 60*1000; // 1 minute

const deviceCache = {};

/**
 * Handles a device message.
 * @param {{ idScope: string, primaryKeyUrl: string, log: Function, getSecret: (context: Object, secretUrl: string) => string }} context 
 * @param {{ deviceId: string }} device 
 * @param {{ [field: string]: number }} measurements 
 */
module.exports = async function (context, device, measurements) {
    if (device) {
        if (!device.deviceId || !/^[a-z0-9\-]*$/.test(device.deviceId)) {
            throw {
                message: 'Invalid format: deviceId must be alphanumeric, lowercase, and may contain hyphens.',
                statusCode: 400
            };
        }
    } else {
        throw {
            message: 'Invalid format: a device specification must be provided.',
            statusCode: 400
        };
    }

    if (!validateMeasurements(measurements)) {
        throw  {
            message: 'Invalid format: invalid measurement list.',
            statusCode: 400
        };
    }

    const client = Device.Client.fromConnectionString(await getDeviceConnectionString(context, device), DeviceTransport.Http);

    try {
        await new Promise((resolve, reject) => {
            client.open((err) => {
                if (err) {
                    return reject(err);
                }

                context.log('[HTTP] Sending telemetry for device', device.deviceId);

                client.sendEvent(new Device.Message(JSON.stringify(measurements)), err => {
                    if (err) {
                        // If the device was deleted, we remove its cached connection string
                        if (err.name === 'DeviceNotFoundError' && deviceCache[device.deviceId]) {
                            delete deviceCache[device.deviceId].connectionString;
                        }

                        return reject(err);
                    }

                    client.close(err => err ? reject(err) : resolve());
                });
            });
        });
    } catch (e) {
        throw new Error(`Unable to send telemetry for device ${device.deviceId}: ${e.message}`);
    }
};

/**
 * @returns true if measurements object is valid
 */
function validateMeasurements(measurements) {
    if (!measurements || typeof measurements !== 'object') {
        return false;
    }

    for (const field in measurements) {
        if (typeof measurements[field] !== 'number') {
            return false;
        }
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

async function getDeviceHub(context, device) {
    const deviceId = device.deviceId;
    const now = Date.now();

    if (deviceCache[deviceId] && deviceCache[deviceId].lasRegisterAttempt && (now - deviceCache[deviceId].lasRegisterAttempt) < minDeviceRegistrationTimeout) {
        const backoff = Math.floor((minDeviceRegistrationTimeout - (now - deviceCache[deviceId].lasRegisterAttempt)) / 1000);
        const message = `Unable to register device ${deviceId}. Minimum registration timeout not yet exceeded. Please try again in ${backoff} seconds`;
        throw { message, statusCode: 403 };
    }

    deviceCache[deviceId] = {
        ...deviceCache[deviceId],
        lasRegisterAttempt: Date.now()
    }

    const sasToken = await getRegistrationSasToken(context, deviceId);

    const registrationOptions = {
        url: `https://${registrationHost}/${context.idScope}/registrations/${deviceId}/register?api-version=${registrationApiVersion}`,
        method: 'PUT',
        json: true,
        headers: { Authorization: sasToken },
        body: { registrationId: deviceId }
    };

    try {
        context.log('[HTTP] Initiating device registration');
        const response = await request(registrationOptions);

        if (response.status !== 'assigning' || !response.operationId) {
            throw new Error();
        }

        const statusOptions = {
            url: `https://${registrationHost}/${context.idScope}/registrations/${deviceId}/operations/${response.operationId}?api-version=${registrationApiVersion}`,
            method: 'GET',
            json: true,
            headers: { Authorization: sasToken }
        };

        for (const timeout of [...registrationRetryTimeouts, 0 /* Fail right away after the last attempt */]) {
            context.log('[HTTP] Querying device registration status');
            const statusResponse = await request(statusOptions);

            if (statusResponse.status === 'assigning') {
                await new Promise(resolve => setTimeout(resolve, timeout));
            } else if (statusResponse.status === 'assigned' && statusResponse.registrationState && statusResponse.registrationState.assignedHub) {
                return statusResponse.registrationState.assignedHub;
            } else if (statusResponse.status === 'failed' && statusResponse.registrationState && statusResponse.registrationState.errorCode === 400209) {
                throw {
                    message: 'The device may be unassociated or blocked',
                    statusCode: 403
                };
            } else {
                throw new Error();
            }
        }

        throw new Error('Registration was not successful after maximum number of attempts');
    } catch (e) {
        throw {
            message: `Unable to register device ${deviceId}: ${e.message}`,
            statusCode: e.statusCode
        };
    }
}

async function getRegistrationSasToken(context, deviceId) {
    const uri = encodeURIComponent(`${context.idScope}/registrations/${deviceId}`);
    const ttl = Math.round(Date.now() / 1000) + registrationSasTtl;
    const signature = crypto.createHmac('sha256', new Buffer(await getDeviceKey(context, deviceId), 'base64'))
        .update(`${uri}\n${ttl}`)
        .digest('base64');
    return`SharedAccessSignature sr=${uri}&sig=${encodeURIComponent(signature)}&skn=registration&se=${ttl}`;
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