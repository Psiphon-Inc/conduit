package ca.psiphon.conduit.nativemodule;

public class ConduitServiceParameters {
    private int maxClients;
    private int limitUpstreamBytes;
    private int limitDownstreamBytes;
    private String proxyPrivateKey;

    public ConduitServiceParameters() {
        // Initialize parameters with invalid values
        this.maxClients = -1;
        this.limitUpstreamBytes = -1;
        this.limitDownstreamBytes = -1;
        this.proxyPrivateKey = null;
    }

    public int getMaxClients() {
        return maxClients;
    }

    public int getLimitUpstreamBytes() {
        return limitUpstreamBytes;
    }

    public int getLimitDownstreamBytes() {
        return limitDownstreamBytes;
    }

    public String getProxyPrivateKey() {
        return proxyPrivateKey;
    }

    public void storeParameters(int maxClients, int limitUpstreamBytes, int limitDownstreamBytes, String privateKey) {
        this.maxClients = maxClients;
        this.limitUpstreamBytes = limitUpstreamBytes;
        this.limitDownstreamBytes = limitDownstreamBytes;
        this.proxyPrivateKey = privateKey;
    }

    public boolean updateParametersIfChanged(int maxClients, int limitUpstreamBytes, int limitDownstreamBytes, String privateKey) {
        boolean paramsChanged = maxClients != this.maxClients ||
                limitUpstreamBytes != this.limitUpstreamBytes ||
                limitDownstreamBytes != this.limitDownstreamBytes ||
                (privateKey != null && !privateKey.equals(this.proxyPrivateKey));

        if (paramsChanged) {
            storeParameters(maxClients, limitUpstreamBytes, limitDownstreamBytes, privateKey);
        }

        return paramsChanged;
    }

    public boolean validateParameters() {
        return getMaxClients() != -1 ||
                getLimitUpstreamBytes() != -1 ||
                getLimitDownstreamBytes() != -1 ||
                getProxyPrivateKey() != null;
    }

}
