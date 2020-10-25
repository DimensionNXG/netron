/* jshint esversion: 6 */
/* global pako */

var gzip = gzip || {};

gzip.Archive = class {

    constructor(buffer) {
        this._entries = [];
        const stream = buffer instanceof Uint8Array ? new gzip.BinaryReader(buffer) : buffer;
        const signature = [ 0x1f, 0x8b ];
        if (stream.length < 18 || !stream.peek(2).every((value, index) => value === signature[index])) {
            throw new gzip.Error('Invalid gzip archive.');
        }
        this._entries.push(new gzip.Entry(stream));
        stream.seek(0);
    }

    get entries() {
        return this._entries;
    }
};

gzip.Entry = class {

    constructor(stream) {
        const signature = [ 0x1f, 0x8b ];
        if (stream.position + 2 > stream.length ||
            !stream.read(2).every((value, index) => value === signature[index])) {
            throw new gzip.Error('Invalid gzip signature.');
        }
        let reader = new gzip.BinaryReader(stream.read(8));
        const compressionMethod = reader.byte();
        if (compressionMethod != 8) {
            throw new gzip.Error("Invalid compression method '" + compressionMethod.toString() + "'.");
        }
        const flags = reader.byte();
        reader.uint32(); // MTIME
        reader.byte();
        reader.byte(); // OS
        if ((flags & 4) != 0) { // FEXTRA
            const xlen = stream.byte() | (stream.byte() << 8);
            stream.skip(xlen);
        }
        const string = () => {
            let text = '';
            while (stream.position < stream.length) {
                const value = stream.byte();
                if (value === 0x00) {
                    break;
                }
                text += String.fromCharCode(value);
            }
            return text;
        };
        if ((flags & 8) != 0) { // FNAME
            this._name = string();
        }
        if ((flags & 16) != 0) { // FCOMMENT
            string();
        }
        if ((flags & 1) != 0) { // CRC16x
            stream.skip(2);
        }
        this._stream = stream.stream(stream.length - stream.position - 8);
        reader = new gzip.BinaryReader(stream.read(8));
        reader.uint32(); // CRC32
        this._size = reader.uint32();
    }

    get name() {
        return this._name;
    }

    get stream() {
        if (this._size !== undefined) {
            const compressedData = this._stream.read();
            let buffer = null;
            if (typeof process === 'object' && typeof process.versions == 'object' && typeof process.versions.node !== 'undefined') {
                buffer = require('zlib').inflateRawSync(compressedData);
            }
            else if (typeof pako !== 'undefined') {
                buffer = pako.inflateRaw(compressedData);
            }
            else {
                buffer = new require('./zip').Inflater().inflateRaw(compressedData);
            }
            if (this._size != buffer.length) {
                throw new gzip.Error('Invalid size.');
            }
            this._stream = this._stream.create(buffer);
            delete this._size;
        }
        return this._stream;
    }

    get data() {
        return this.stream.peek();
    }
};

gzip.BinaryReader = class {

    constructor(buffer) {
        this._buffer = buffer;
        this._length = buffer.length;
        this._position = 0;
        this._view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }

    get position() {
        return this._position;
    }

    get length() {
        return this._length;
    }

    create(buffer) {
        return new gzip.BinaryReader(buffer);
    }

    stream(length) {
        return this.create(this.read(length));
    }

    seek(position) {
        this._position = position >= 0 ? position : this._length + position;
    }

    skip(offset) {
        this._position += offset;
    }

    peek(length) {
        if (this._position === 0 && length === undefined) {
            return this._buffer;
        }
        const position = this._position;
        this.skip(length !== undefined ? length : this._length - this._position);
        const end = this._position;
        this.seek(position);
        return this._buffer.subarray(position, end);
    }

    read(length) {
        if (this._position === 0 && length === undefined) {
            this._position = this._length;
            return this._buffer;
        }
        const position = this._position;
        this.skip(length !== undefined ? length : this._length - this._position);
        return this._buffer.subarray(position, this._position);
    }

    byte() {
        const position = this._position;
        this.skip(1);
        return this._buffer[position];
    }

    uint16() {
        const position = this._position;
        this.skip(2);
        return this._view.getUint16(position, true);
    }

    uint32() {
        const position = this._position;
        this.skip(4);
        return this._view.getUint32(position, true);
    }
};

gzip.Error = class extends Error {
    constructor(message) {
        super(message);
        this.name = 'Gzip Error';
    }
};

if (typeof module !== 'undefined' && typeof module.exports === 'object') {
    module.exports.Archive = gzip.Archive;
}