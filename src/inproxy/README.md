# React Native Conduit native module

## Usage

```js
import ConduitModule from "<specify correct import path>";

// Example of toggling in-proxy with parameters
const toggleInProxy = async (
    maxClients,
    limitUpstream,
    limitDownstream,
    privateKey,
) => {
    try {
        await ConduitModule.toggleInProxy(
            maxClients,
            limitUpstream,
            limitDownstream,
            privateKey,
        );
        console.log("In-proxy toggled successfully");
    } catch (error) {
        console.error("Failed to toggle in-proxy:", error);
    }
};

// Example of changing service parameters
const changeParams = async (
    maxClients,
    limitUpstream,
    limitDownstream,
    privateKey,
) => {
    try {
        await ConduitModule.paramsChanged(
            maxClients,
            limitUpstream,
            limitDownstream,
            privateKey,
        );
        console.log("Parameters updated successfully");
    } catch (error) {
        console.error("Failed to change parameters:", error);
    }
};

// Example of sending feedback
const sendFeedback = async () => {
    try {
        const feedbackResponse = await ConduitModule.sendFeedback();
        if (feedbackResponse === null) {
            console.log("Feedback successfully enqueued.");
        } else {
            console.log("Feedback already pending:", feedbackResponse);
        }
    } catch (error) {
        console.error("Failed to send feedback:", error);
    }
};

// Example of logging info
ConduitModule.logInfo("Tag", "This is an informational message");

// Example of logging errors
ConduitModule.logError("Tag", "This is an error message");
```

### Events Emitted to React Native Host

All events emitted to the React Native host follow the same structure:

-   **Top-Level Structure**: Each event contains two objects at the top level:
    -   `type`: The type of event (e.g., `proxyState`, `proxyError`, `inProxyActivityStats`).
    -   `data`: An object containing event-specific information, which may include an `action` field and arbitrary keys for further details.

#### 1. **Proxy State Updates**

This event is emitted when there is an update in the proxy's state.

-   **Event Name (`type`)**: `proxyState`
-   **Data Included (`data`)**:
    -   `status`: The current status of the proxy service (`RUNNING`, `STOPPED`, `UNKNOWN`).
    -   `networkState`: The current network state (`HAS_INTERNET`, `NO_INTERNET`).
        -   **Note**: `networkState` will be `null` if the `status` is `STOPPED` or `UNKNOWN`.

#### 2. **Error Events**

These events are related to error conditions that occur within the proxy service. Each error event includes an `action` field in `data`, along with potential additional arbitrary keys.

-   **Event Name (`type`)**: `proxyError`
-   **Data Included (`data`)**:
    -   `action`: Specific action corresponding to the error (e.g., `proxyStartFailed`, `proxyRestartFailed`).
    -   Arbitrary keys with additional error details, which may vary based on the error context.
-   **Possible Actions**:
    -   `proxyStartFailed`: Emitted when the proxy fails to start.
    -   `proxyRestartFailed`: Emitted when the proxy fails to restart.
    -   `inProxyMustUpgrade`: Emitted when an in-proxy upgrade is required.

**Note**: The `data` object may include further arbitrary keys, providing additional context or information about the error.

#### 3. **Proxy Activity Statistics**

This event provides statistics related to in-proxy activity.

-   **Event Name (`type`)**: `inProxyActivityStats`
-   **Data Included (`data`)**:
    -   `elapsedTime`: Total time in milliseconds.
    -   `totalBytesUp`: Cumulative bytes uploaded.
    -   `totalBytesDown`: Cumulative bytes downloaded.
    -   `currentConnectingClients`: Number of connecting clients.
    -   `currentConnectedClients`: Number of connected clients.
    -   `dataByPeriod`: A map containing detailed activity statistics by time period.

### React Native Event Handling Example

Here’s an example of how you can handle these events in your React Native app:

```javascript
const emitter = new NativeEventEmitter(ConduitModule);

emitter.addListener("ConduitEvent", (event) => {
    const { type, data } = event;

    if (type === "proxyState") {
        console.log("Proxy State Updated:", data);
    } else if (type === "inProxyActivityStats") {
        console.log("Proxy Stats Updated:", data);
    } else if (type === "proxyError") {
        const { action, ...otherData } = data;
        console.log("Error Event:", action, otherData); // Handles error with action + arbitrary keys
    } else {
        console.log("Unknown Event:", event);
    }
});
```
