---
page_type: sample
description: "A sample that shows how to create a device bridge to connect other IoT clouds such as Sigfox, Particle, and The Things Network to IoT Central"
languages:
- javascript
products:
- azure-iot-central
- azure-iot
urlFragment: iot-central-device-bridge-sample
---


# Azure IoT Central Device Bridge
This repository contains everything you need create a device bridge to connect other IoT clouds such as Sigfox, Particle, and The Things Network (TTN) to IoT Central. The device bridge forwards the messages your devices send to other clouds to your IoT Central app. In your IoT Central app, you can build rules and run analytics on that data, create workflows in Microsoft Flow and Azure Logic apps, export that data, and much more. This solution will provision several Azure resources into your Azure subscription that work together to transform and forward device messages through a webhook integration in Azure Functions.

To use the device bridge solution, you will need the following:
- An Azure account. You can create a free Azure account from [here](https://aka.ms/aft-iot).
- An Azure IoT Central application to connect the devices. Create a free app by following [these instructions](https://docs.microsoft.com/azure/iot-central/quick-deploy-iot-central).

[![Deploy to Azure](http://azuredeploy.net/deploybutton.png)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2FAzure%2Fiotc-device-bridge%2Fmaster%2Fazuredeploy.json)

## Instructions
For detailed instructions on how to deploy and configure the device bridge, see [Use the IoT Central device bridge to connect other IoT clouds to IoT Central](https://docs.microsoft.com/en-us/azure/iot-central/core/howto-build-iotc-device-bridge).

## Limitations
This device bridge only forwards messages to IoT Central, and does not send messages back to devices. Due to the unidirectional nature of this solution, `settings` and `commands` will **not** work for devices that connect to IoT Central through this device bridge. Because device twin operations are also not supported, it's **not** possible to update `device properties` through this setup. To use these features, a device must be connected directly to IoT Central using one of the [Azure IoT device SDKs](https://docs.microsoft.com/en-us/azure/iot-hub/iot-hub-devguide-sdks).

## Package integrity
The template provided here deploys a packaged version of the code in this repository to an Azure
Function. You can check the integrity of the code being deployed by verifying that the `SHA256` hash
of the `iotc-bridge-az-function.zip` file in the root of this repository matches the following:

```
0988532d85ffc8d84c1c6c65d6edd5744ed2c695af8b9481172c705d542b5af7
```

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

## Updating the package
The code in the repository is deployed to the Azure Function from the `iotc-bridge-az-function.zip` package at the repository root.
When updating the source code, this package also needs to be updated and tested. To update, simply make a zip file from the `IoTCIntegration`
folder that contains your source changes. Make sure to exclude non-source files, such as `node_modules`.

To test your changes, use the `azuredeploy.json` ARM template in the repository root. Change the `packageUri`
variable to point to your modified zip package location (zip package URL can be obtained from your GitHub branch) and deploy the template in the Azure Portal.
Make sure that the function deploys correctly and that you're able to send device data through the test tab in the Azure Portal.

## Updating the README
Change this README to document any user-facing changes, e.g., changes in the incoming payload format.
Also update the SHA256 hash in the _Package integrity_ section above with the hash of your new zip package, for integrity verification.