const request = require('request-promise-native');
const handleMessage = require('./lib/engine');

const parameters = {
    idScope: process.env['ID_SCOPE'],
    primaryKeyUrl: process.env['IOTC_KEY_URL']
};

let kvToken;

module.exports = async function (context, req) {
    try {
        await handleMessage({ ...parameters, log: context.log, getSecret: getKeyVaultSecret }, req.body.device, req.body.measurements);
    } catch (e) {
        if (e.message && e.message.startsWith('Invalid format:')) {
            context.res = {
                status: 400,
                body: e.message
            };
        } else {
            throw e;
        }
    }
}

/**
 * Fetches a Key Vault secret. Attempts to refresh the token on authorization errors.
 */
async function getKeyVaultSecret(context, secretUrl, forceTokenRefresh = false) {
    if (!kvToken || forceTokenRefresh) {
        const options = {
            uri: `${process.env["MSI_ENDPOINT"]}/?resource=https://vault.azure.net&api-version=2017-09-01`,
            headers: { 'Secret': process.env["MSI_SECRET"] },
            json: true
        };

        try {
            context.log('[HTTP] Requesting new Key Vault token');
            const response = await request(options);
            kvToken = response.access_token;
        } catch (e) {
            context.log('[ERROR] Unable to get Key Vault token', e);
            throw e;
        }
    }

    var options = {
        url: `${secretUrl}?api-version=2016-10-01`,
        headers : { 'Authorization' : `Bearer ${kvToken}` },
        json: true
    };

    try {
        context.log('[HTTP] Requesting Key Vault secret', secretUrl);
        const response = await request(options);
        return response && response.value;
    } catch(e) {
        if (e.statusCode === 401 && !forceTokenRefresh) {
            return await getKeyVaultSecret(context, secretUrl, true);
        } else {
            context.log('[ERROR] Unable to fetch secret', secretUrl, e);
            throw e;
        }
    }
}