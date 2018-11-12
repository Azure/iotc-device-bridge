/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const StatusError = require('../error').StatusError;

const supportedTypes = ['int', 'uint', 'float'];
const supportedSizes = [8, 16, 32, 64];
const supportedEndianess = ['little-endian', 'big-endian'];

/**
 * Converts Sigfox device data in HEX format to a map of measurement field names to values.
 * 
 * Supports:
 *   - 'int', 'uint', and 'float' types
 *   - 8, 16, 32, and 64 bit sizes
 *   - 'little-endian' and 'big-endian'
 * 
 * @param payloadDefinition Sigfox payload definition
 * @param payload HEX device data
 */
module.exports = function (payloadDefinition, payload) {
    const measurements = {};
    const fields = parseSigfoxPayloadDefinition(payloadDefinition);
    const data = new Buffer(payload, 'hex');
    let offset = 0;

    for (const field of fields) {
        const size = field.size / 8;

        switch (field.type) {
            case 'int':
                measurements[field.name] = field.littleEndian ? data.readIntLE(offset, size) : data.readIntBE(offset, size);
                break;
            case 'uint':
                measurements[field.name] = field.littleEndian ? data.readUIntLE(offset, size) : data.readUIntBE(offset, size);
                break;
            case 'float':
                if (size === 4) {
                    measurements[field.name] = field.littleEndian ? data.readFloatLE(offset) : data.readFloatBE(offset);
                } else if (size === 8) {
                    measurements[field.name] = field.littleEndian ? data.readDoubleLE(offset) : data.readDoubleBE(offset);
                }

                break;
        }

        offset += size;
    }

    return measurements;
}

function parseSigfoxPayloadDefinition(definition) {
    const fields = [];
    definition = definition.trim();

    for (const field of definition.split(' ').filter(s => s)) {
        let name, type, size, endianess;

        try {
            [name, remainder] = field.split('::');
            const parts = remainder.split(':');
            type = parts[0];
            size = parseInt(parts[1]);
            endianess = (parts.length >= 3) ? parts[2] : null;
        } catch (e) {
            throw new StatusError('Malformed payload definition', 400);
        }

        if (!name) {
            throw new StatusError('Malformed payload definition', 400);
        }

        if (!supportedTypes.includes(type)) {
            throw new StatusError(`Malformed payload definition: only 'int', 'uint', and 'float' field types are supported`, 400);
        }

        if (!supportedSizes.includes(size)) {
            throw new StatusError('Malformed payload definition: field size must be 8, 16, 32, or 64 bits', 400);
        }

        if (type === 'float' && size !== 32 && size !== 64) {
            throw new StatusError('Malformed payload definition: float fields must be 32 or 64 bits in size', 400);
        }

        if (endianess && !supportedEndianess.includes(endianess)) {
            throw new StatusError('Malformed payload definition: invalid endianess', 400);
        }

        fields.push({
            name,
            type,
            size,
            littleEndian: !!endianess && endianess === 'little-endian'
        });
    }

    return fields;
}