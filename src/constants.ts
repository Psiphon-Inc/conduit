export const DEFAULT_INPROXY_MAX_CLIENTS = 2;
export const DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND = 10 * 1024 * 1024; // 10 MB

// if these are maxed out, it means a potential of 8Gbps
// TODO: More consideration around these values, what are most phones capable of
export const INPROXY_MAX_CLIENTS_MAX = 25;
export const INPROXY_MAX_MBPS_PER_PEER = 40;

export const PRIVACY_POLICY_URL =
    "https://psiphon-inc.github.io/conduit-privacy-policy/";

// Hard code a common delay value for animations that fade in to wait until the
// particle video is done playing.
export const PARTICLE_VIDEO_DELAY_MS = 2800;

// Window height cutoff used to render smaller text in Skia Paragraphs
export const WINDOW_HEIGHT_FONT_SIZE_CUTOFF = 800;
