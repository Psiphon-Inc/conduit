package ca.psiphon.conduit.nativemodule;

import java.util.Map;

public class ConduitServiceParameters {
    static final String MAX_CLIENTS_KEY = "maxClients";
    static final String LIMIT_UPSTREAM_BYTES_KEY = "limitUpstreamBytes";
    static final String LIMIT_DOWNSTREAM_BYTES_KEY = "limitDownstreamBytes";
    static final String INPROXY_PRIVATE_KEY_KEY = "inProxyPrivateKey";

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

    public boolean updateParametersFromMap (Map<String, Object> params) {
        boolean paramsChanged = false;
        if (params.containsKey(MAX_CLIENTS_KEY)) {
            Integer maxClients = (Integer) params.get(MAX_CLIENTS_KEY);
            if (maxClients != null && maxClients != getMaxClients()) {
                storeParameters(maxClients, getLimitUpstreamBytes(), getLimitDownstreamBytes(), getProxyPrivateKey());
                paramsChanged = true;
            }
        }

        if (params.containsKey(LIMIT_UPSTREAM_BYTES_KEY)) {
            Integer limitUpstreamBytes = (Integer) params.get(LIMIT_UPSTREAM_BYTES_KEY);
            if (limitUpstreamBytes != null && limitUpstreamBytes != getLimitUpstreamBytes()) {
                storeParameters(getMaxClients(), limitUpstreamBytes, getLimitDownstreamBytes(), getProxyPrivateKey());
                paramsChanged = true;
            }
        }

        if (params.containsKey(LIMIT_DOWNSTREAM_BYTES_KEY)) {
            Integer limitDownstreamBytes = (Integer) params.get(LIMIT_DOWNSTREAM_BYTES_KEY);
            if (limitDownstreamBytes != null && limitDownstreamBytes != getLimitDownstreamBytes()) {
                storeParameters(getMaxClients(), getLimitUpstreamBytes(), limitDownstreamBytes, getProxyPrivateKey());
                paramsChanged = true;
            }
        }

        if (params.containsKey(INPROXY_PRIVATE_KEY_KEY)) {
            String privateKey = (String) params.get(INPROXY_PRIVATE_KEY_KEY);
            if (privateKey != null && !privateKey.equals(getProxyPrivateKey())) {
                storeParameters(getMaxClients(), getLimitUpstreamBytes(), getLimitDownstreamBytes(), privateKey);
                paramsChanged = true;
            }
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
