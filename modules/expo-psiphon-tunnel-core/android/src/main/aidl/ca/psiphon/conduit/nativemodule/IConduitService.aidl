package ca.psiphon.conduit.nativemodule;

import android.os.Bundle;
import ca.psiphon.conduit.nativemodule.IConduitClientCallback;

interface IConduitService {
    void registerClient(IConduitClientCallback client);
    void unregisterClient(IConduitClientCallback client);
    Bundle consumePendingProxyError();
}
