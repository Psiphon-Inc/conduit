/*
 * Copyright (c) 2024, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */


export const DEFAULT_INPROXY_MAX_CLIENTS = 2;
export const DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND = 10 * 1024 * 1024; // 10 MB

// if these are maxed out, it means a potential of 8Gbps at full capacity
export const INPROXY_MAX_CLIENTS_MAX = 25;
export const INPROXY_MAX_MBPS_PER_PEER_MAX = 40;

export const LEARN_MORE_URL = "https://conduit.psiphon.ca/en";
export const PRIVACY_POLICY_URL =
    "https://conduit.psiphon.ca/en/conduit-privacy-policy";

// Hard code a common delay value for animations that fade in to wait until the
// particle video is done playing.
export const PARTICLE_VIDEO_DELAY_MS = 2800;

// Window height cutoff used to render smaller text in Skia Paragraphs
export const WINDOW_HEIGHT_FONT_SIZE_CUTOFF = 800;

// AsyncStorage keys, centralized to prevent accidental collision
export const ASYNCSTORAGE_HAS_ONBOARDED_KEY = "hasOnboarded";
export const ASYNCSTORAGE_MOCK_INPROXY_RUNNING_KEY = "MockInproxyRunning";
export const ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY = "InproxyMaxClients";
export const ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY =
    "InproxyLimitBytesPerSecond";

// SecureStore keys, centralized to prevent accidental collision
export const SECURESTORE_MNEMONIC_KEY = "mnemonic";
export const SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY =
    "accountKeyPairBase64nopad";
export const SECURESTORE_DEVICE_NONCE_KEY = "deviceNonce";
export const SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY =
    "inproxyKeyPairBase64nopad";
export const SECURESTORE_CONDUIT_NAME_KEY = "conduitName";

// useQuery query keys, centralized to prevent accidental collision
// auth
export const QUERYKEY_ACCOUNT_KEYPAIR = "accountKeyPair";
export const QUERYKEY_INPROXY_KEYPAIR = "conduitKeyPair";
// inproxy
export const QUERYKEY_INPROXY_STATUS = "inproxyStatus";
export const QUERYKEY_INPROXY_ACTIVITY_BY_1000MS = "inproxyActivityBy1000ms";
export const QUERYKEY_INPROXY_CURRENT_CONNECTED_CLIENTS =
    "inproxyCurrentConnectedClients";
export const QUERYKEY_INPROXY_CURRENT_CONNECTING_CLIENTS =
    "inproxyCurrentConnectingClients";
export const QUERYKEY_INPROXY_TOTAL_BYTES_TRANSFERRED =
    "inproxyTotalBytesTransferred";
export const QUERYKEY_INPROXY_MUST_UPGRADE = "inproxyMustUpgrade";
export const QUERYKEY_CONDUIT_NAME = "conduitName";
export const QUERYKEY_NOTIFICATIONS_PERMISSIONS =
    "sync-notifications-permissions";
