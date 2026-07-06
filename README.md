# MidiAI Studio Homepage V17 - Admin Dashboard

V17 adds an operations-oriented admin dashboard on top of V16.

## Added

- Admin dashboard counters: users, active licenses, open tickets, notices, patch notes, orders
- User/license management table
  - Search by email/name/UID/HWID 
  - Filter by license status
  - Quick grant: Lifetime / Trial / Ban
  - HWID reset action
- Download/latest version management from the admin page
- Keeps V16 table-style content management for notices, patch notes, FAQ, and support tickets

## Firestore collections used

- users
- licenses
- orders
- announcements
- patchNotes
- faq
- supportTickets
- downloads/latest

## Important

Apply `firebase/firestore-rules.example.txt` to Firestore Rules.
Your admin account must have:

```text
users/{YOUR_UID}/role = "admin"
```

## Deploy

Copy all files into the GitHub Pages repository root, then commit and push with GitHub Desktop.
