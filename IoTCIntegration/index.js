/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const request = require("request-promise-native");
const handleMessage = require("./lib/engine");

const msiEndpoint = process.env.MSI_ENDPOINT;
const msiSecret = process.env.MSI_SECRET;

const parameters = {
  idScope: process.env.ID_SCOPE,
  primaryKeyUrl: process.env.IOTC_KEY_URL,
};

let kvToken;

module.exports = async function (context, req) {
  try {
    await handleMessage(
      { ...parameters, log: context.log, getSecret: getKeyVaultSecret },
      req.body
    );
  } catch (e) {
    context.log("[ERROR]", e.message);

    context.res = {
      status: e.statusCode ? e.statusCode : 500,
      body: e.message,
    };
  }
};

/**
 * Fetches a Key Vault secret. Attempts to refresh the token on authorization errors.
 */
async function getKeyVaultSecret(
  context,
  secretUrl,
  forceTokenRefresh = false
) {
  if (!kvToken || forceTokenRefresh) {
    const options = {
      uri: `${msiEndpoint}/?resource=https://vault.azure.net&api-version=2017-09-01`,
      headers: { Secret: msiSecret },
      json: true,
    };

    try {
      context.log("[HTTP] Requesting new Key Vault token");
      const response = await request(options);
      kvToken = response.access_token;
    } catch (e) {
      throw new Error("Unable to get Key Vault token");
    }
  }

  var options = {
    url: `${secretUrl}?api-version=2016-10-01`,
    headers: { Authorization: `Bearer ${kvToken}` },
    json: true,
  };

  try {
    context.log("[HTTP] Requesting Key Vault secret", secretUrl);
    const response = await request(options);
    return response && response.value;
  } catch (e) {
    if (e.statusCode === 401 && !forceTokenRefresh) {
      return await getKeyVaultSecret(context, secretUrl, true);
    } else {
      throw new Error("Unable to fetch secret");
    }
  }
}
