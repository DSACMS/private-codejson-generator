# Security Concerns for OAuth Token Storage

## Overview

This document explains the security decisions made for storing OAuth session tokens in the private-codejson-generator application, which uses GitHub OAuth to access private repositories.

## Architecture

```
┌─────────────────────┐     ┌─────────────────────────────────────────┐
│   GitHub Pages      │     │   AWS API Gateway + Lambda              │
│   (Frontend)        │     │   (Backend)                             │
│                     │     │                                         │
│ dsacms.github.io    │────▶│ *.execute-api.us-gov-west-1.amazonaws.com│
└─────────────────────┘     └─────────────────────────────────────────┘
        │                                    │
        │                                    ▼
        │                          ┌─────────────────┐
        │                          │   DynamoDB      │
        │                          │   (Sessions)    │
        │                          └─────────────────┘
        │                                    │
        └────────────────────────────────────┘
                    Different domains
```

## The Security Goal

Store the OAuth session token in a way that:
1. Prevents theft via Cross-Site Scripting (XSS) attacks
2. Limits exposure if a token is compromised
3. Follows security best practices for web applications

## Approach 1: HttpOnly Cookies (Attempted)

### Why HttpOnly Cookies Are Preferred

HttpOnly cookies are the gold standard for storing session tokens because:
- JavaScript cannot access them (`document.cookie` returns nothing)
- They're automatically sent with requests by the browser
- XSS attacks cannot steal the token directly

### Implementation Attempted

We configured:
- **Cookie attributes**: `HttpOnly; Secure; SameSite=None; Path=/`
- **CORS headers**: `Access-Control-Allow-Credentials: true` with explicit origin
- **Frontend**: `fetch()` with `credentials: 'include'`

### Why It Failed: Third-Party Cookie Blocking

Modern browsers block third-party cookies for privacy reasons. A "third-party cookie" is one where:
- The cookie's domain differs from the page's domain
- This is used to prevent cross-site tracking by advertisers

In our architecture:
1. User visits `dsacms.github.io`
2. OAuth redirects to API Gateway, which sets a cookie on `*.execute-api.us-gov-west-1.amazonaws.com`
3. User returns to `dsacms.github.io`
4. Frontend makes request to API Gateway with `credentials: 'include'`
5. **Browser blocks the cookie** because it's "third-party" to the current page

```
Browser's perspective:
┌────────────────────────────────────────────────────────────┐
│ Current page: dsacms.github.io                             │
│                                                            │
│ Request to: execute-api.us-gov-west-1.amazonaws.com        │
│ Cookie domain: execute-api.us-gov-west-1.amazonaws.com     │
│                                                            │
│ Decision: BLOCKED (third-party cookie)                     │
└────────────────────────────────────────────────────────────┘
```

This behavior is consistent across:
- **Chrome**: Third-party cookie phase-out in progress
- **Safari**: Intelligent Tracking Prevention (ITP) blocks by default
- **Firefox**: Enhanced Tracking Protection blocks by default

### CHIPS (Partitioned Cookies) - Also Attempted

CHIPS (Cookies Having Independent Partitioned State) allows third-party cookies that are "partitioned" by the top-level site. We attempted this with:

```
Set-Cookie: __Host-github_session=<token>; Secure; HttpOnly; SameSite=None; Partitioned; Path=/
```

**Why it failed**: CHIPS requires the cookie to be set while the frontend domain is the "top-level" page. In OAuth redirect flows, the cookie is set when the API Gateway domain is the top-level page (during the callback redirect), so the partition key doesn't match.

CHIPS is designed for embedded content (iframes), not redirect-based OAuth flows.

## Approach 2: localStorage (Current Implementation)

Since HttpOnly cookies aren't viable for this cross-origin architecture, we store the session token in localStorage. This creates a security concern because localStorage is accessible to any JavaScript running on the page, making it vulnerable to XSS attacks.

### Current Risk

If an attacker successfully executes XSS on the page, they can:
```javascript
// Attacker's script
const token = localStorage.getItem('github_oauth_session');
// Send token to attacker's server
```

With this token, an attacker could access the user's private GitHub repositories (within the scope granted during OAuth).

## Alternative Approaches Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **HttpOnly cookies** | XSS-proof | Blocked as third-party cookies | ❌ Not viable |
| **CHIPS (Partitioned cookies)** | Works cross-origin | Doesn't work with OAuth redirects | ❌ Not viable |
| **Custom domain** | Same-origin cookies work | Requires infrastructure changes, can't use GitHub Pages | ⚠️ Viable but complex |
| **In-memory storage** | More secure than localStorage | Re-auth on every page refresh | ⚠️ Poor UX |
| **sessionStorage** | Cleared on tab close | Still vulnerable to XSS | ⚠️ Marginal improvement |

## Threat Model

| Risk | Likelihood | Impact |
|------|------------|--------|
| XSS | Low | High |
| Malicious browser extension | Low | High |
| Physical device access | Low | Medium |


## Conclusion

While HttpOnly cookies are the preferred method for storing session tokens, browser privacy features (third-party cookie blocking) make them unworkable for static sites hosted on a different domain than their API.

The current localStorage implementation is functional but carries inherent XSS risk. This is a known limitation of the GitHub Pages + separate API architecture.
