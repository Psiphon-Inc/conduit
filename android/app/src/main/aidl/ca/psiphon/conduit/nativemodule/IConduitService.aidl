package ca.psiphon.conduit.nativemodule;

import ca.psiphon.conduit.nativemodule.IConduitClientCallback;

interface IConduitService {
    void registerClient(IConduitClientCallback client);
    void unregisterClient(IConduitClientCallback client);
}
