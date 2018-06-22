// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import { nodeStreamToBufferPromise } from "@utils/stream/BufferUtils";
import * as debug_ from "debug";
import * as moment from "moment";
import * as request from "request";
import * as requestPromise from "request-promise-native";

import { LCP } from "../parser/epub/lcp";

const debug = debug_("r2:lcp#lsd/lcpl-update");

export async function lsdLcpUpdate(
    lsdJson: any,
    lcp: LCP): Promise<string> {

    if (lsdJson.updated && lsdJson.updated.license &&
        (lcp.Updated || lcp.Issued)) {
        const updatedLicenseLSD = moment(lsdJson.updated.license);
        const updatedLicense = moment(lcp.Updated || lcp.Issued);
        const forceUpdate = false; // just for testing!
        if (forceUpdate ||
            updatedLicense.isBefore(updatedLicenseLSD)) {
            debug("LSD license updating...");
            if (lsdJson.links) {
                const licenseLink = lsdJson.links.find((link: any) => {
                    return link.rel === "license";
                });
                if (!licenseLink) {
                    return Promise.reject("LSD license link is missing.");
                }

                debug("OLD LCP LICENSE, FETCHING LSD UPDATE ... " + licenseLink.href);

                return new Promise<any>(async (resolve, reject) => {

                    const failure = (err: any) => {
                        reject(err);
                    };

                    const success = async (response: request.RequestResponse) => {

                        Object.keys(response.headers).forEach((header: string) => {
                            debug(header + " => " + response.headers[header]);
                        });

                        if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
                            // SEE: https://github.com/readium/readium-lcp-server/issues/150#issuecomment-356993350
                            // if (licenseLink.href.indexOf("/licenses/") > 0) {
                            //     licenseLink.href = licenseLink.href.replace("/licenses/",
                            // "/api/v1/purchases/license/");
                            //     debug("TRYING AGAIN: " + licenseLink.href);
                            //     let newRes: any;
                            //     try {
                            //         newRes = await lsdLcpUpdate(lsdJson, lcp); // recursive
                            //     } catch (err) {
                            //         failure(err);
                            //         return;
                            //     }
                            //     resolve(newRes);
                            // } else {
                            //     failure("HTTP CODE " + response.statusCode);
                            // }
                            failure("HTTP CODE " + response.statusCode);
                            return;
                        }

                        let responseData: Buffer;
                        try {
                            responseData = await nodeStreamToBufferPromise(response);
                        } catch (err) {
                            reject(err);
                            return;
                        }
                        const lcplStr = responseData.toString("utf8");
                        debug(lcplStr);
                        resolve(lcplStr);
                    };

                    const headers = {
                        "Accept-Language": "en-UK,en-US;q=0.7,en;q=0.5",
                    };

                    // No response streaming! :(
                    // https://github.com/request/request-promise/issues/90
                    const needsStreamingResponse = true;
                    if (needsStreamingResponse) {
                        request.get({
                            headers,
                            method: "GET",
                            uri: licenseLink.href,
                        })
                            .on("response", success)
                            .on("error", failure);
                    } else {
                        let response: requestPromise.FullResponse;
                        try {
                            // tslint:disable-next-line:await-promise no-floating-promises
                            response = await requestPromise({
                                headers,
                                method: "GET",
                                resolveWithFullResponse: true,
                                uri: licenseLink.href,
                            });
                        } catch (err) {
                            failure(err);
                            return;
                        }

                        await success(response);
                    }
                });
            }
        }
    }
    return Promise.reject("No LSD LCP update.");
}
