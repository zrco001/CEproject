import { internalThing } from '../../payables/expense/application/internal.js';
import { expenseModule } from '../../payables/expense/expense.module.js';

export const crossModule = [internalThing, expenseModule];
