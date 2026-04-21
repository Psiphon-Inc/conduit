package ca.psiphon.conduit.state;

interface IConduitStateCallback {
    void onStateUpdate(String stateJson);
}
