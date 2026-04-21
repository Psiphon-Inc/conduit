package ca.psiphon.conduit.state;

import ca.psiphon.conduit.state.IConduitStateCallback;

interface IConduitStateService {
    void registerClient(IConduitStateCallback callback);
    void unregisterClient(IConduitStateCallback callback);
    String fetchConduitPrivateKey();
}
