# IoT Central cloud gateway
This repository contains everything you need create a cloud gateway into Azure IoT Central that can be used to ingest device data from other sources such as other IoT platforms. It will provision an Azure Function that can be used to transform and forward device messages into IoT Central using HTTP POST requests.

[![Deploy to Azure](http://azuredeploy.net/deploybutton.png)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2FAzure%2Fiotc-cloud-to-cloud-integration%2Fmaster%2Fazuredeploy.json%3Ftoken%3DAnbfx7e7jycDM2vU0KeLkuI8xt0Xd_EXks5b09fTwA%253D%253D)

## Instructions
Take the following steps to deploy an Azure Function into your subscription and set up the cloud gateway.

1. Click the `Deploy to Azure` button above. This opens up a custom ARM template in the Azure Portal to deploy the Azure Function.

1. Go to your IoT Central application, and navigate to the `Administration > Device Connection` area.
  - Copy the `Scope ID` and paste it into the `Scope ID` field the custom template. 
  - Copy one of the SAS keys, so either the `Primary Key` or the `Secondary Key`, and paste it into the `Iot Central SAS Key` field. (this key will be stored in a Key Vault
provisioned with the function).

  ![Scope ID and key](assets/scopeIdAndKey.PNG "Scope ID and key")

3. After the deployment is done, install the required NPM packages in the function. To do this,
go to the Function App that was deployed to your subscription in the `Functions > IoTCIntegration > Console` tab.
In the console, run the command `npm install` (this command takes ~20 minutes to complete, so feel free to do something else in that time).

![Install packages](assets/npmInstall.PNG "Install packages")

4. After the package installation finishes, the Function App needs to be restarted by clicking the
`Restart` button in `Overview` page.

![Restart Function App](assets/restart.PNG "Restart Function App")

5. The function is now ready to use. External systems can feed device data through this cloud gateway and into your IoT Central app by making HTTP POST requests to the function URL. The URL can be obtained in the newly created function App in `Functions > IoTCIntegration > Get function URL`.

![Get function URL](assets/getFunctionUrl.PNG "Get function URL")

Messages sent to the cloud gateway must have the following format in the Body. 
```json
{
    "device": {
        "deviceId": "my-cloud-device"
    },
    "measurements": {
        "temp": 20.31,
        "pressure": 50,
        "humidity": 8.5
    }
}
```

> NOTE: `deviceId` must be alphanumeric, lowercase, and may contain hyphens. The values of the fields in `measurements` must be numbers (i.e. not quoted).

6. When a message with a new `deviceId` is sent to IoT Central by the cloud gateway, a device will be created as an **Unassociated device**. Unassociated devices appear in your IoT Central application in `Device Explorer > Unassociated devices`. Click `Associate` and choose a device template to start receiving incoming measurements from that device in IoT Central.

> NOTE: Until the device is associated to a template, HTTP calls to the function will return a 403 error status.

![Associate device](assets/associate.PNG "Associate device")

## What is being provisioned? (pricing)
The custom template in this repository will provision the following Azure resources:
- Key Vault, needed to store your IoT Central key
- Storage Account
- App Service Plan (S1 tier)
- Function App

The estimated total cost of these resources is **$75/month**. The majority of this cost ($73) comes from the App Service Plan. We chose this plan because it offers dedicated compute
resources which leads to faster server response times. This is a critical factor for IoT platforms in the cloud that allow streaming of lots of device data through webhooks. With this setup, the maximum observed performance of the Azure Function in this repository was around **1,500 device messages per minute**.

To reduce the cost of this solution, you can:
1. **Remove the provisioned resources when they are not in use.**
2. **Replace the App Service Plan by a Consumption Plan.** While this option does not offer dedicated compute resources, it may be enough for testing purposes or for applications that tolerate higher server response times. You can learn more about the [Azure Function hosting options
in documentation](https://docs.microsoft.com/en-us/azure/azure-functions/functions-scale).

To use a Consumption Plan instead of an App Service Plan, edit the custom template before deploying. Click the `Edit template` button. 

 ![Edit template](assets/editTemplate.PNG "Edit template")
  
Replace the segment

```json
{
  "type": "Microsoft.Web/serverfarms",
  "sku": {
      "name": "S1",
      "tier": "Standard",
      "size": "S1",
      "family": "S",
      "capacity": 1
  },
  "kind": "app",
  "name": "[variables('planName')]",
  "apiVersion": "2016-09-01",
  "location": "[resourceGroup().location]",
  "tags": {
      "iotCentral": "cloud-gateway",
      "iotCentralCloudGateway": "app-service-plan"
  },
  "properties": {
      "name": "[variables('planName')]"
  }
},
```

with

```json
{
  "type": "Microsoft.Web/serverfarms",
  "apiVersion": "2015-04-01",
  "name": "[variables('planName')]",
  "location": "[resourceGroup().location]",
  "properties": {
    "name": "[variables('planName')]",
    "computeMode": "Dynamic",
    "sku": "Dynamic"
  }
},
```
Here is the [sample custom template in Github](https://github.com/Azure/azure-quickstart-templates/blob/abaf3c3eaa81cc5cba5ccc253b89a99569a42ac3/101-function-app-create-dynamic/azuredeploy.json#L49) where this snippet came from.

## Example: connecting a Particle device through the cloud gateway
To connect a Particle device through this gateway to Azure IoT Central, go to the Particle console, and create a new webhook integration. Set the `Request Format` to `JSON` and, under `Advanced Settings`, use the following custom body format:

```
{
  "device": {
    "deviceId": "{{{PARTICLE_DEVICE_ID}}}"
  },
  "measurements": {
    "{{{PARTICLE_EVENT_NAME}}}": {{{PARTICLE_EVENT_VALUE}}}
  }
}

```

Paste in the function URL from your Azure Function, and you should see Particle devices appear as unassociated devices in IoT Central. 

## Limitations
This cloud gateway only forwards messages to IoT Central, and does not send messages back to devices. Due to the unidirectional nature of this solution, `settings` and `commands` will **not** work for devices that connect to IoT Central through this cloud gateway. To use these features, a device must be connected directly to IoT Central using one of the [Azure IoT device SDKs](https://docs.microsoft.com/en-us/azure/iot-hub/iot-hub-devguide-sdks).

# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
