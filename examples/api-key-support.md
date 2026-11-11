# API Key Operations

## Rotate a service API key

Service owners should rotate service API keys every 90 days and immediately after suspected exposure. Create a replacement key in Settings, then update each service that uses the key. Revoke the previous key after the replacement has been verified in production.

## Respond to a suspected key exposure

If a service API key may have been exposed, revoke it immediately, create a replacement, and review the audit history for unexpected use. Record the incident in the security log.
