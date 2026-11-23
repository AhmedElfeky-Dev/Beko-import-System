# Plan: Sea Mode (FCL/LCL) + Weight & CBM for LCL/Air

## Goal

Differentiate shipment data entry based on transport mode:
- **Sea → FCL**: Show the Containers section (current behavior).
- **Sea → LCL**: Hide containers, show **Weight (kg)** and **CBM** fields.
- **Air**: Hide containers, show **Weight (kg)** and **CBM** fields.

## Changes

### 1. `src/types/shipment.ts`
- Add new type `SeaMode = "FCL" | "LCL"`.
- Extend `Shipment` interface with:
  - `seaMode?: SeaMode` (only meaningful when `shipmentType === "SEA"`)
  - `weightKg?: number`
  - `cbm?: number`
- No changes to status calculations.

### 2. `src/pages/ShipmentForm.tsx`
- Default `emptyShipment()`: `seaMode: "FCL"`, `weightKg: 0`, `cbm: 0`.
- In **Basic Information** section: when `shipmentType === "SEA"`, render a new "Sea Mode" select (`FCL` / `LCL`) right after the Type field.
- **Containers section**: render only if `shipmentType === "SEA" && seaMode === "FCL"`.
- New **Cargo Measurements** section (or inline within Shipping Details): render `Weight (kg)` and `CBM` number inputs when:
  - `shipmentType === "AIR"`, OR
  - `shipmentType === "SEA" && seaMode === "LCL"`.
- When user switches Sea→FCL, keep containers; switching to LCL or to AIR keeps the data in state but the section is hidden (non-destructive — easy to switch back).
- Free Days input keeps its current behavior (Sea only — applies to both FCL and LCL).

### 3. `src/pages/ShipmentDetail.tsx`
- In the Logistics card: show `Sea Mode` for SEA shipments.
- Show `Weight (kg)` and `CBM` fields for AIR or SEA-LCL.
- Render the Containers card only for SEA-FCL (current condition `containers.length > 0` remains a safety check).

### 4. `src/data/sampleShipments.ts`
- Backfill `seaMode: "FCL"` for existing SEA samples so the UI continues to show containers for them. AIR samples get `weightKg` / `cbm` example values.

### 5. Backward compatibility
- Migration in `ShipmentForm` `useEffect`: if a SEA shipment has no `seaMode`, default it to `"FCL"` (so older saved shipments behave as before).

## Out of scope
- No changes to costs, demurrage, analytics, or Excel export columns. (Can be added later if you want Weight/CBM in exports.)