Ticket cleanup audit
====================

Before deleting legacy creation code, checked repository references, parsed property calls with the TypeScript AST, and passed both old-panel native creation and legacy closure regression tests. Removed the disabled root ticket/ticketpanel commands, their now-unreachable creation helpers, and unused local HTML/temp transcript helpers. Kept legacy closure, metadata parsing, administration and archival support for existing tickets. Database records and historical archives are preserved. Full build and regression suite passed after removal.
