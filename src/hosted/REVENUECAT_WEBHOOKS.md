# RevenueCat Webhook Auth Notes

- RevenueCat webhooks support a dashboard-configured `Authorization` header value.
- Backend handlers should verify that header value exactly before processing webhook payloads.
- RevenueCat does not provide a default HMAC signature verification contract in webhook headers.
- Do not assume an HMAC signature header exists unless we explicitly enable/configure one and document it.

Reference:

- https://www.revenuecat.com/docs/integrations/webhooks
