---
name: Migration approval gate
description: When the user asks to see a migration before execution, stop and wait for explicit confirmation
type: preference
---
Quando Marco chiede esplicitamente di vedere una migrazione prima dell'esecuzione, NON eseguirla: mostra la SQL proposta e fermati finché non arriva la sua conferma esplicita, anche se il canale di approvazione la lascerebbe passare.

**Why:** richiesta esplicita dell'utente, prevale sul default di sistema.
**How to apply:** in quel caso descrivi la SQL nel messaggio (blocco di codice) e non chiamare il tool di migrazione fino alla conferma.
