module.exports = {
    StatusError: class extends Error {
        constructor (message, statusCode) {
            super(message);
            this.statusCode = statusCode;
        }
    }
}