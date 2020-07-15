# Contributing to this repository
When contributing to this repository, the following tasks may be needed in addition to changes to the source code:

## Updating the package
The code in the repository is deployed to the Azure Function from the `iotc-bridge-az-function.zip` package at the repository root.
When updating the source code, this package also needs to be updated and tested. To update, simply make a zip file from the `IoTCIntegration`
folder that contains your source changes. Make sure to exclude non-source files, such as `node_modules`.

To test your changes, use the `azuredeploy.json` ARM template in the repository root. Change the `packageUri`
variable to point to your modified zip package location (zip package URL can be obtained from your GitHub branch) and deploy the template in the Azure Portal.
Make sure that the function deploys correctly and that you're able to send device data through the test tab in the Azure Portal.

## Updating the README
Change the README to document any user-facing changes, e.g., changes in the incoming payload format.
Also update the SHA256 hash in the README with the hash of your new zip package, for integrity verification.