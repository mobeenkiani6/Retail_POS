# Nycto Retail Admin Panel

HQ management console for Nycto Retail Mart POS.

- **Port:** 5174
- **API:** proxies `/api` and `/socket.io` → `localhost:5001`
- **Access:** owner, admin, or manager roles

```powershell
npm install
npm run dev
```

Realtime updates use Socket.IO namespace `/events` (room `admin:hq`).
