// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

// import * as crypto from "crypto";
// import * as zlib from "zlib";

import { Encrypted } from "@models/metadata-encrypted";
// import { IDecryptedBuffer, LCP } from "@parser/epub/lcp";
import { LCP } from "@parser/epub/lcp";
// import { RangeStream } from "@utils/stream/RangeStream";
import { IStreamAndLength } from "@utils/zip/zip";
import * as debug_ from "debug";

// import * as forge from "node-forge";
// import { bufferToStream, streamToBufferPromise } from "@utils/stream/BufferUtils";
// import { CounterPassThroughStream } from "@utils/stream/CounterPassThroughStream";
// import { Transform } from "stream";

const debug = debug_("r2:lcp#transform/transformer-lcp");

// const AES_BLOCK_SIZE = 16;

// let streamCounter = 0;

// const readStream = async (s: NodeJS.ReadableStream, n: number): Promise<Buffer> => {
//     return new Promise<Buffer>((resolve, reject) => {
//         // s.pause();
//         const onReadable = () => {
//             // debug("readStream READABLE");
//             const b = s.read(n);
//             s.removeListener("readable", onReadable);
//             s.removeListener("error", reject);
//             // s.resume();
//             resolve(b as Buffer);
//         };
//         s.on("readable", onReadable);
//         s.on("error", reject);
//         // s.on("end", () => {
//         //     debug("readStream END");
//         // });
//         // s.on("drain", () => {
//         //     debug("readStream DRAIN");
//         // });
//         // s.on("finish", () => {
//         //     debug("readStream FINISH");
//         // });
//     });
// };

export interface ICryptoInfo {
    length: number;
    padding: number;
}

export function supports(
    lcp: LCP,
    _linkHref: string,
    linkPropertiesEncrypted: Encrypted): boolean {

    if (!lcp) {
        return false;
    }

    if (!lcp.isReady()) {
        debug("LCP not ready!");
        return false;
    }

    const check = linkPropertiesEncrypted.Scheme === "http://readium.org/2014/01/lcp"
        && (linkPropertiesEncrypted.Profile === "http://readium.org/lcp/basic-profile" ||
        linkPropertiesEncrypted.Profile === "http://readium.org/lcp/profile-1.0")
        && linkPropertiesEncrypted.Algorithm === "http://www.w3.org/2001/04/xmlenc#aes256-cbc"
        ;
    if (!check) {
        debug("Incorrect resource LCP fields.");
        debug(linkPropertiesEncrypted.Scheme);
        debug(linkPropertiesEncrypted.Profile);
        debug(linkPropertiesEncrypted.Algorithm);
        return false;
    }

    return true;
}

export async function transformStream(
    lcp: LCP,
    linkHref: string,
    linkPropertiesEncrypted: Encrypted,
    stream: IStreamAndLength,
    isPartialByteRangeRequest: boolean,
    partialByteBegin: number,
    partialByteEnd: number): Promise<IStreamAndLength> {
    debug(
        "transformStream",
        lcp,
        linkHref,
        linkPropertiesEncrypted,
        stream,
        isPartialByteRangeRequest,
        partialByteBegin,
        partialByteEnd,
    );
    return Promise.reject("LCP not supported in a browser");
/*
    const isCompressionNone = linkPropertiesEncrypted.Compression === "none";
    const isCompressionDeflate = linkPropertiesEncrypted.Compression === "deflate";

    let plainTextSize = -1;

    let nativelyDecryptedStream: NodeJS.ReadableStream | undefined;
    let nativelyInflated = false;
    if (lcp.isNativeNodePlugin()) {

        debug("DECRYPT: " + linkHref);

        let fullEncryptedBuffer: Buffer;
        try {
            fullEncryptedBuffer = await streamToBufferPromise(stream.stream);
        } catch (err) {
            debug(err);
            return Promise.reject("OUCH!");
        }

        // debug(fullEncryptedBuffer.length);

        // debug(fullEncryptedBuffer.slice(0, 32));

        // debug(fullEncryptedBuffer.slice(fullEncryptedBuffer.length - 32));

        let res: IDecryptedBuffer;
        try {
            res = await lcp.decrypt(fullEncryptedBuffer, linkHref, isCompressionDeflate);
        } catch (err) {
            debug(err);
            return Promise.reject("OUCH!");
        }

        const nativelyDecryptedBuffer = res.buffer;
        nativelyInflated = res.inflated;

        // debug(nativelyDecryptedBuffer.length);

        plainTextSize = nativelyDecryptedBuffer.length;
        linkPropertiesEncrypted.DecryptedLengthBeforeInflate = plainTextSize;

        if (!nativelyInflated && // necessary, even if isCompressionNone! (LCP inflation byte variance)
            linkPropertiesEncrypted.OriginalLength &&
            isCompressionNone &&
            linkPropertiesEncrypted.OriginalLength !== plainTextSize) {

            debug(`############### ` +
                `LCP transformStream() LENGTH NOT MATCH ` +
                `linkPropertiesEncrypted.OriginalLength !== plainTextSize: ` +
                `${linkPropertiesEncrypted.OriginalLength} !== ${plainTextSize}`);
        }

        nativelyDecryptedStream = bufferToStream(nativelyDecryptedBuffer);
    } else {
        let cryptoInfo: ICryptoInfo | undefined;
        let cypherBlockPadding = -1;
        if (linkPropertiesEncrypted.DecryptedLengthBeforeInflate > 0) {
            plainTextSize = linkPropertiesEncrypted.DecryptedLengthBeforeInflate;
            cypherBlockPadding = linkPropertiesEncrypted.CypherBlockPadding;
        } else {
            // const timeBegin = process.hrtime();
            try {
                cryptoInfo = await getDecryptedSizeStream(lcp, stream);
            } catch (err) {
                debug(err);
                return Promise.reject(err);
            }
            plainTextSize = cryptoInfo.length;
            cypherBlockPadding = cryptoInfo.padding;

            // length cached to avoid resetting the stream to zero-position
            linkPropertiesEncrypted.DecryptedLengthBeforeInflate = plainTextSize;
            linkPropertiesEncrypted.CypherBlockPadding = cypherBlockPadding;

            try {
                stream = await stream.reset();
            } catch (err) {
                debug(err);
                return Promise.reject(err);
            }

            // const timeElapsed = process.hrtime(timeBegin);
            // debug(`LCP transformStream() ---- getDecryptedSizeStream():` +
            //     `${timeElapsed[0]} seconds + ${timeElapsed[1]} nanoseconds`);

            // debug("LCP transformStream() ---- getDecryptedSizeStream(): " + plainTextSize);

            if (linkPropertiesEncrypted.OriginalLength &&
                isCompressionNone &&
                linkPropertiesEncrypted.OriginalLength !== plainTextSize) {

                debug(`############### ` +
                    `LCP transformStream() LENGTH NOT MATCH ` +
                    `linkPropertiesEncrypted.OriginalLength !== plainTextSize: ` +
                    `${linkPropertiesEncrypted.OriginalLength} !== ${plainTextSize}`);
            }
        }
    }

    if (partialByteBegin < 0) {
        partialByteBegin = 0;
    }

    if (partialByteEnd < 0) {
        partialByteEnd = plainTextSize - 1;
        if (linkPropertiesEncrypted.OriginalLength) {
            partialByteEnd = linkPropertiesEncrypted.OriginalLength - 1;
        }
    }

    let destStream: NodeJS.ReadableStream;
    if (nativelyDecryptedStream) {
        destStream = nativelyDecryptedStream;
    } else {
        // const partialByteLength = (partialByteEnd + 1) - partialByteBegin;

        let rawDecryptStream: NodeJS.ReadableStream | undefined;

        let ivBuffer: Buffer | undefined;
        if (linkPropertiesEncrypted.CypherBlockIV) {
            ivBuffer = Buffer.from(linkPropertiesEncrypted.CypherBlockIV, "binary");

            const cypherRangeStream = new RangeStream(AES_BLOCK_SIZE, stream.length - 1, stream.length);
            stream.stream.pipe(cypherRangeStream);
            rawDecryptStream = cypherRangeStream;
        } else {
            // const ivRangeStream = new RangeStream(0, AES_BLOCK_SIZE - 1, stream.length);
            // stream.stream.pipe(ivRangeStream);
            // try {
            //     ivBuffer = await streamToBufferPromise(ivRangeStream);
            // } catch (err) {
            //     debug(err);
            //     return Promise.reject("OUCH!");
            // }
            // try {
            //     stream = await stream.reset();
            // } catch (err) {
            //     debug(err);
            //     return Promise.reject(err);
            // }

            // debug("D1");
            // debug(ivBuffer.length);
            // debug(ivBuffer.toString("hex"));

            // ivBuffer = stream.stream.read(AES_BLOCK_SIZE) as Buffer;

            try {
                ivBuffer = await readStream(stream.stream, AES_BLOCK_SIZE);
            } catch (err) {
                debug(err);
                return Promise.reject(err);
            }

            // debug("D2");
            // debug(ivBuffer.length);
            // debug(ivBuffer.toString("hex"));
            // b06ca4cec8831eb158f1a317503f5101
            // === asharedculture_soundtrack.mp3
            //
            // 07e6870e5d708f39e98316b5c0a574c5
            // === shared-culture.mp4

            linkPropertiesEncrypted.CypherBlockIV = ivBuffer.toString("binary");

            stream.stream.resume();
            rawDecryptStream = stream.stream;
        }
        // debug("IV: " + forge.util.bytesToHex(ivBuffer));

        // debug(forge.util.bytesToHex(contentKey as string));

        // https://github.com/nodejs/node/blob/master/lib/crypto.js#L259
        const decryptStream = crypto.createDecipheriv("aes-256-cbc",
            lcp.ContentKey, // new Buffer(contentKey as string, "binary"),
            ivBuffer);
        decryptStream.setAutoPadding(false);
        rawDecryptStream.pipe(decryptStream);

        destStream = decryptStream;

        if (linkPropertiesEncrypted.CypherBlockPadding) {
            // debugx("cryptoInfo.padding: " + cypherBlockPadding);
            const cypherUnpaddedStream = new RangeStream(0, plainTextSize - 1, plainTextSize);
            destStream.pipe(cypherUnpaddedStream);
            destStream = cypherUnpaddedStream;
        }

        // const counterStream2 = new CounterPassThroughStream(++streamCounter);
        // destStream.pipe(counterStream2)
        //     .on("progress", function f() {
        //         // debug("Crypto PROGRESS: " +
        //         //     (this as CounterPassThroughStream).id +
        //         //     " -- " + (this as CounterPassThroughStream).bytesReceived);
        //     })
        //     .on("end", function f() {
        //         debug("Crypto END: " +
        //             (this as CounterPassThroughStream).id);
        //     })
        //     .on("close", function f() {
        //         debug("Crypto CLOSE: " +
        //             (this as CounterPassThroughStream).id);
        //     })
        //     .once("finish", function f() {
        //         debug("Crypto FINISH: " +
        //             (this as CounterPassThroughStream).id +
        //             " -- " + (this as CounterPassThroughStream).bytesReceived);

        //         if (plainTextSize !==
        //             (this as CounterPassThroughStream).bytesReceived) {

        //             debug(`############### ` +
        //                 `LCP Crypto LENGTH NOT MATCH ` +
        //                 `plainTextSize !== bytesReceived:` +
        //                 `${plainTextSize} !== ` +
        //                 `${(this as CounterPassThroughStream).bytesReceived}`);
        //         }
        //     })
        //     .on("error", function f() {
        //         debug("CounterPassThroughStream ERROR: " +
        //             (this as CounterPassThroughStream).id);
        //     })
        //     .on("pipe", function f() {
        //         debug("CounterPassThroughStream PIPE: " +
        //             (this as CounterPassThroughStream).id);
        //     })
        //     .on("unpipe", function f() {
        //         debug("CounterPassThroughStream UNPIPE: " +
        //             (this as CounterPassThroughStream).id);
        //     })
        //     .on("drain", function f() {
        //         // debug("CounterPassThroughStream DRAIN: " +
        //         //     (this as CounterPassThroughStream).id);
        //     });
        // destStream = counterStream2;
    }

    if (!nativelyInflated && isCompressionDeflate) {

        // https://github.com/nodejs/node/blob/master/lib/zlib.js
        const inflateStream = zlib.createInflateRaw();
        destStream.pipe(inflateStream);
        destStream = inflateStream;

        // const counterStream = new CounterPassThroughStream(++streamCounter);
        // inflateStream.pipe(counterStream)
        //     .on("progress", function f() {
        //         // debug("CounterPassThroughStream PROGRESS: " +
        //         //     (this as CounterPassThroughStream).id +
        //         //     " -- " + (this as CounterPassThroughStream).bytesReceived);
        //     })
        //     .on("end", function f() {
        //         debug("CounterPassThroughStream END: " +
        //             (this as CounterPassThroughStream).id);
        //     })
        //     .on("close", function f() {
        //         debug("CounterPassThroughStream CLOSE: " +
        //             (this as CounterPassThroughStream).id);
        //     })
        //     .once("finish", function f() {
        //         debug("CounterPassThroughStream FINISH: " +
        //             (this as CounterPassThroughStream).id +
        //             " -- " + (this as CounterPassThroughStream).bytesReceived);

        //         if (linkPropertiesEncrypted.OriginalLength &&
        //             linkPropertiesEncrypted.OriginalLength !==
        //             (this as CounterPassThroughStream).bytesReceived) {

        //             debug(`############### ` +
        //                 `LCP zlib.createInflateRaw LENGTH NOT MATCH ` +
        //                 `linkPropertiesEncrypted.OriginalLength !== bytesReceived:` +
        //                 `${linkPropertiesEncrypted.OriginalLength} !== ` +
        //                 `${(this as CounterPassThroughStream).bytesReceived}`);
        //         }
        //     })
        //     .on("error", function f() {
        //         debug("CounterPassThroughStream ERROR: " +
        //             (this as CounterPassThroughStream).id);
        //     })
        //     .on("pipe", function f() {
        //         debug("CounterPassThroughStream PIPE: " +
        //             (this as CounterPassThroughStream).id);
        //     })
        //     .on("unpipe", function f() {
        //         debug("CounterPassThroughStream UNPIPE: " +
        //             (this as CounterPassThroughStream).id);
        //     })
        //     .on("drain", function f() {
        //         // debug("CounterPassThroughStream DRAIN: " +
        //         //     (this as CounterPassThroughStream).id);
        //     });
        // destStream = counterStream;
    }

    const l = (!nativelyInflated && linkPropertiesEncrypted.OriginalLength) ?
        linkPropertiesEncrypted.OriginalLength : plainTextSize;

    if (isPartialByteRangeRequest) {
        const rangeStream = new RangeStream(partialByteBegin, partialByteEnd, l);
        destStream.pipe(rangeStream);
        destStream = rangeStream;
        // l = partialByteLength;
    }

    const sal: IStreamAndLength = {
        length: l,
        reset: async () => {

            let resetedStream: IStreamAndLength;
            try {
                resetedStream = await stream.reset();
            } catch (err) {
                debug(err);
                return Promise.reject(err);
            }

            return transformStream(
                lcp, linkHref, linkPropertiesEncrypted,
                resetedStream,
                isPartialByteRangeRequest,
                partialByteBegin, partialByteEnd);
        },
        stream: destStream,
    };
    return Promise.resolve(sal);
*/
}

export async function getDecryptedSizeStream(
    lcp: LCP,
    stream: IStreamAndLength): Promise<ICryptoInfo> {
    debug("getDecryptedSizeStream", lcp, stream);
    return new Promise<ICryptoInfo>((_resolve, reject) => {
        reject("LCP not supported in a browser.");
/*
        // debug("LCP getDecryptedSizeStream() stream.length: " + stream.length);

        // debug("LCP getDecryptedSizeStream() AES_BLOCK_SIZE: " + AES_BLOCK_SIZE);

        // CipherText = IV + PlainText + BLOCK - (PlainText MOD BLOCK)
        // overflow: (PlainText MOD BLOCK) === PlainText - (floor(PlainText / BLOCK) * BLOCK)
        // thus: CipherText = IV + BLOCK * (floor(PlainText / BLOCK) + 1)

        // IV = AES_BLOCK_SIZE (first block in cyphertext)
        // + at least one block
        // (last one in cyphertext is either full 16-bytes random W3C padding
        // in case plaintext is exactly multiple of block size,
        // or partial cypher + padding)
        const TWO_AES_BLOCK_SIZE = 2 * AES_BLOCK_SIZE;
        if (stream.length < TWO_AES_BLOCK_SIZE) {
            reject("crypto err");
            return;
        }
        const readPos = stream.length - TWO_AES_BLOCK_SIZE;

        const cypherRangeStream = new RangeStream(readPos, readPos + TWO_AES_BLOCK_SIZE - 1, stream.length);
        stream.stream.pipe(cypherRangeStream);

        // let buff: Buffer;
        // try {
        //     buff = await streamToBufferPromise(cypherRangeStream);
        // } catch (err) {
        //     debug(err);
        //     reject("crypto err");
        //     return;
        // }

        // // debug("LCP getDecryptedSizeStream() buff.length: " + buff.length);

        // // // debug(buff.toString("hex"));
        // // for (let i = 0; i < buff.length; i++) {
        // //     const b = buff[i];
        // //     if (i === AES_BLOCK_SIZE) {
        // //         debug("____");
        // //     }
        // //     debug(b);
        // // }

        // resolve(this.getDecryptedSizeBuffer_(stream.length, buff));

        const decrypteds: Buffer[] = [];

        cypherRangeStream.on("readable", () => {
            // debug("readable");

            const ivBuffer = cypherRangeStream.read(AES_BLOCK_SIZE);
            if (!ivBuffer) {
                // debug("readable null (end)");
                return;
            }

            // debug(ivBuffer.toString("hex"));
            // e10cb2a27aa7b9633f104ccca113d499
            // === asharedculture_soundtrack.mp3
            //
            // 5d290cb97ea83ccc01a67d30a9c7eeaa
            // === shared-culture.mp4

            const encrypted = cypherRangeStream.read(AES_BLOCK_SIZE);
            // debug(encrypted.toString("hex"));
            // 14b46cb1e279d51c12ce13989b3d6cf3
            // === asharedculture_soundtrack.mp3
            //
            // b2924b9b0cd64ab7cd349beef8e4b068
            // === shared-culture.mp4

            const decryptStream = crypto.createDecipheriv("aes-256-cbc",
                lcp.ContentKey, // new Buffer(contentKey as string, "binary"),
                ivBuffer);
            decryptStream.setAutoPadding(false);

            const buff1 = decryptStream.update(encrypted);
            // debug(buff1.toString("hex"));
            // ecf8848cb3c0c97b9e159ec2daa96810
            // === asharedculture_soundtrack.mp3
            //
            // 004c61766635332e31372e308b6f7004
            // === shared-culture.mp4
            if (buff1) {
                decrypteds.push(buff1);
            }

            const buff2 = decryptStream.final();
            // debug(buff2.toString("hex"));
            if (buff2) {
                decrypteds.push(buff2);
            }
        });

        cypherRangeStream.on("end", () => {
            // debug("end");

            const decrypted = Buffer.concat(decrypteds);
            // debug(decrypted.toString("hex"));
            // debug(decrypted.length);

            const nPaddingBytes = decrypted[AES_BLOCK_SIZE - 1]; // decrypted.length = 1
            // debug(nPaddingBytes);

            const size = stream.length - AES_BLOCK_SIZE - nPaddingBytes;

            const res: ICryptoInfo = {
                length: size,
                padding: nPaddingBytes,
            };
            resolve(res);
        });

        cypherRangeStream.on("error", () => {
            reject("DECRYPT err");
        });
*/
    });
}

// cc-shared-culture/EPUB/audio/asharedculture_soundtrack.mp3
// 3265152 bytes
// 3 MB
// 204072 * 16 BLOCKS (inc IV)
// 3265152 MOD 16 = 0
// IV 16
// PAD 16, full extra block (random)
// + 32 = 3265184 total cypher-text

// cc-shared-culture/EPUB/video/shared-culture.mp4
// 21784780 bytes
// 21 MB
// 1361548.75 * 16 BLOCKS (inc IV)
// 21784780 MOD 16 = 12 (0.75 * 16)
// IV 16
// PAD 4 (12 cypher-text bytes in last block)
// + 20 = 21784800 total cypher-text

// cc-shared-culture/EPUB/video/shared-culture.webm
// 8330669 bytes
// 8 MB
// 520666.8125 * 16 BLOCKS (inc IV)
// 8330669 MOD 16 = 13 (0.8125 * 16)
// IV 16
// PAD 3 (13 cypher-text bytes in last block)
// + 19 = 8330688 total cypher-text
