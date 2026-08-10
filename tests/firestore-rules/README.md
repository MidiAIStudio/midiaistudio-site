# Firestore rules tests (licenses)

Needs **Java** on PATH (Firestore emulator).

```bash
cd tests/firestore-rules
npm i
npm run test:emulators
```

Coverage:
- owner cannot create trial/lifetime
- owner cannot update license fields
- admin can create/update
- unauthenticated write denied
- existing lifetime readable but not overwritable by owner
