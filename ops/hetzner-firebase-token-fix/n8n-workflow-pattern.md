# n8n workflow refactor — Firebase token from file

Apply to EVERY workflow that talks to Firestore via HTTP Request nodes
referencing `{{$env.FIREBASE_ACCESS_TOKEN}}`.

Likely affected workflows (per repo inspection):
- **Workflow 01 — Deal Scanner Pipeline** (node "Write to Firestore")
- Any other custom HTTP Request to `firestore.googleapis.com` with Bearer header

Workflow 02 (Deal Publisher) uses native `googleFirebaseRealtimeDatabase` node — NOT affected.

---

## Pattern

### Before (broken — depends on env var that no longer exists)

```
[Trigger] → [other nodes] → [HTTP Request: Write to Firestore]
                                  Authorization: Bearer {{ $env.FIREBASE_ACCESS_TOKEN }}
```

### After (token loaded from mounted file at runtime)

```
[Trigger] → [Code: Read Firebase Token] → [other nodes] → [HTTP Request: Write to Firestore]
                                                              Authorization: Bearer {{ $('Read Firebase Token').first().json.token }}
```

---

## Step-by-step refactor — Workflow 01

1. Open Workflow 01 ("LETTO — Deal Scanner Pipeline") in n8n UI.

2. Add a **Code** node right after "Every 2h" trigger (rename to "Read Firebase Token"):
   - Mode: Run Once for All Items
   - Language: JavaScript
   - Code:
     ```js
     const fs = require('fs');
     let token;
     try {
       token = fs.readFileSync('/firebase-token.txt', 'utf8').trim();
     } catch (e) {
       throw new Error('Failed to read /firebase-token.txt: ' + e.message);
     }
     if (!token || token.length < 100) {
       throw new Error('Invalid Firebase token (length=' + (token || '').length + ')');
     }
     return [{ json: { token, ...$json } }];
     ```

3. Connect: `Every 2h` → `Read Firebase Token` → (rest of existing chain unchanged).

4. Find the **"Write to Firestore"** HTTP Request node:
   - Open "Headers" or "Authentication" section
   - Replace `Authorization: Bearer {{ $env.FIREBASE_ACCESS_TOKEN }}`
   - With:    `Authorization: Bearer {{ $('Read Firebase Token').first().json.token }}`

5. **Save workflow** → toggle Active.

6. Manual test: click "Execute Workflow" → verify "Read Firebase Token" emits a token (length ~1500), HTTP write to Firestore returns 200.

---

## If `require('fs')` fails

n8n needs `NODE_FUNCTION_ALLOW_BUILTIN=fs` env var (set in docker-compose patch step 2).

After setting and restarting container, Code node can use `fs`. If it still fails:
- Check container logs: `docker logs n8n 2>&1 | grep -i fs`
- Confirm env var landed: `docker exec n8n env | grep NODE_FUNCTION_ALLOW_BUILTIN`
- Should print: `NODE_FUNCTION_ALLOW_BUILTIN=fs`

---

## Alternative: "Read Binary File" node (works without `NODE_FUNCTION_ALLOW_BUILTIN`)

If you'd rather not enable `fs` builtin:

1. Replace Code node with built-in **"Read Binary File"** node:
   - File Path: `/firebase-token.txt`
   - Property Name: `data`

2. Add a Code node after it to convert binary → string:
   ```js
   const buf = $binary.data;
   const token = Buffer.from(buf.data, 'base64').toString('utf8').trim();
   return [{ json: { token, ...$json } }];
   ```

3. Reference `{{ $('Read Token').first().json.token }}` in HTTP Request as before.

This works on stock n8n image without env var changes.

---

## Rollback safety

If after deploying patch the workflow fails:
1. Generate token manually: `sudo /opt/sial-factory/refresh-firebase-token.sh`
2. Set env var temporarily in n8n container: `docker exec n8n env FIREBASE_ACCESS_TOKEN="$(cat /firebase-token.txt)" /bin/sh`
3. Revert `Read Firebase Token` node back to env var reference

But that's emergency only — proper fix is to make the new pattern work.
