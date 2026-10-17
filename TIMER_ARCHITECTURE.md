# CRITICAL: REPAIR TIMER ARCHITECTURE DOCUMENTATION

⚠️ **WARNING: This document describes critical system architecture. Modifications to timer logic can cause data corruption and system instability.** ⚠️

## Executive Summary

The Repair Timer System manages labor time tracking for repair items across multiple modal interfaces. This system is designed to be:
- **Concurrent-safe**: Only one user can time a repair item at once
- **Data-consistent**: Single source of truth for accumulated time
- **Audit-compliant**: All timer operations are logged
- **Failure-resistant**: Graceful handling of unexpected closures

## Core Architecture

### Database Layer (STRONGEST PROTECTION)

#### Primary Table: `repair_items`
- `total_accumulated_hours` (NUMERIC) - **AUTHORITATIVE** timer value
- `timer_active` (BOOLEAN) - Current timer state
- `timer_user_id` (UUID) - User currently timing this item
- `timer_elapsed_ms` (BIGINT) - Current session elapsed time
- `timer_last_started` (TIMESTAMP) - When current session began

#### Protection Constraints
```sql
-- Ensures timer state consistency
CHECK (
  (timer_active = false AND timer_user_id IS NULL) OR 
  (timer_active = true AND timer_user_id IS NOT NULL)
)

-- Prevents negative time values
CHECK (total_accumulated_hours >= 0)
CHECK (timer_elapsed_ms >= 0)
```

#### Audit Table: `repair_timer_audit`
Tracks all timer operations:
- Timer start/stop events
- Time accumulation operations
- User actions and timestamps
- Before/after values for auditability

#### Secure Functions
- `start_repair_timer()` - Validates and starts timers
- `stop_repair_timer()` - Stops timers and accumulates time
- Includes user authorization and state validation

### Application Layer (HOOK-BASED PROTECTION)

#### Core Hook: `useRepairTimer`
Location: `src/hooks/useRepairTimer.ts`

**CRITICAL: This hook is the ONLY way timer logic should be implemented**

##### Protected Operations:
1. **Timer Initialization**
   - Loads existing accumulated time
   - Checks for concurrent access
   - Starts timer session securely

2. **Active Timer Management**
   - Updates UI every second
   - Persists to database every 60 seconds
   - Maintains accurate time tracking

3. **Timer Cleanup**
   - Accumulates session time into total
   - Clears active timer state
   - Triggers UI refresh events

##### Concurrency Protection:
- Database-level user validation
- Active timer ownership checking
- Graceful conflict resolution

##### Data Integrity:
- Single source of truth enforcement
- Atomic time accumulation operations
- Audit trail maintenance

## Usage Patterns

### For Repair Item Modals

```typescript
import { useRepairTimer } from '@/hooks/useRepairTimer';

const MyRepairModal = ({ isOpen, onClose, item }) => {
  const timer = useRepairTimer({
    repairItemId: item.id,
    packageId: item.package_id,
    isModalOpen: isOpen,
    onClose
  });

  // Use timer.elapsedTime for display
  // Use timer.formatTime() for formatting
  // Call timer.cleanup() before closing

  const handleClose = async () => {
    await timer.cleanup(); // CRITICAL: Must call cleanup
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      {/* Timer display */}
      <div>Time: {timer.formatTime(timer.elapsedTime)}</div>
      {/* Modal content */}
    </Dialog>
  );
};
```

### Current Implementations
- `DiagnoseItemModal` - Uses timer for diagnosis time tracking
- `ItemInRepairModal` - Uses timer for repair estimate time tracking
- Future modals opened from repair item cards

## Critical Business Rules

### 1. Single Source of Truth
- `repair_items.total_accumulated_hours` is the ONLY authoritative time value
- All displays and calculations derive from this field
- Session time is accumulated into this field on timer stop

### 2. Concurrency Control
- Only ONE user can have an active timer per repair item
- Database constraints prevent invalid concurrent states
- Graceful handling when conflicts occur

### 3. Data Persistence
- UI updates every second for real-time display
- Database updates every 60 seconds for persistence
- Final accumulation on timer stop/modal close

### 4. Audit Requirements
- All timer operations logged in `repair_timer_audit`
- User actions tracked with timestamps
- Before/after values recorded for compliance

### 5. Error Recovery
- Graceful handling of network interruptions
- Automatic state recovery on modal reopen
- Data protection during unexpected closures

## Security Measures

### Database Level
- Row-level security on all timer tables
- Secure functions with user validation
- Constraint-based state validation
- Trigger-based change monitoring

### Application Level
- Input validation and sanitization
- User authorization checking
- Error boundary protection
- Comprehensive logging

## Migration Guidelines

### When Adding New Timer-Enabled Modals:

1. **DO NOT** copy timer logic from existing modals
2. **DO** use the `useRepairTimer` hook exclusively
3. **ENSURE** proper cleanup in modal close handlers
4. **TEST** concurrent access scenarios thoroughly

### When Modifying Timer Logic:

1. **STOP** - Consider if modification is truly necessary
2. **DOCUMENT** all changes with business justification
3. **TEST** all existing timer implementations
4. **VERIFY** database constraints still function
5. **UPDATE** this architecture document

### Forbidden Modifications:

❌ **NEVER** modify timer logic directly in modal components
❌ **NEVER** bypass the `useRepairTimer` hook
❌ **NEVER** modify database timer fields outside secure functions
❌ **NEVER** remove or weaken database constraints
❌ **NEVER** disable audit logging

## Troubleshooting

### Common Issues:

1. **Timer shows wrong time**
   - Check `total_accumulated_hours` in database
   - Verify session time calculation
   - Ensure no concurrent modifications

2. **"Item In Use" errors**
   - Check `timer_active` and `timer_user_id` fields
   - Verify user has permission to access item
   - Clear orphaned timer states if necessary

3. **Time not persisting**
   - Verify cleanup function is called
   - Check for database transaction failures
   - Review audit logs for error patterns

### Debug Queries:
```sql
-- Check timer state for specific item
SELECT timer_active, timer_user_id, total_accumulated_hours, timer_elapsed_ms
FROM repair_items WHERE id = '$ITEM_ID';

-- Review recent timer operations
SELECT * FROM repair_timer_audit 
WHERE repair_item_id = '$ITEM_ID' 
ORDER BY created_at DESC LIMIT 10;
```

## Future Considerations

### Planned Enhancements:
- Real-time timer synchronization across browser tabs
- Timer pause/resume functionality
- Bulk timer operations for multiple items
- Advanced reporting and analytics

### Architecture Evolution:
- Consider moving to WebSocket-based real-time updates
- Evaluate event sourcing patterns for complete audit trails
- Assess performance optimization opportunities
- Plan for horizontal scaling requirements

---

**REMEMBER: This timer system protects critical business data. Always understand the full impact of any changes before implementation.**