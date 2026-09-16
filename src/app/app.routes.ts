import { Routes } from '@angular/router';
import { BudgetDashboardComponent } from './budget-dashboard/budget-dashboard.component';
import { ExpenseBreakdownComponent } from './expense-breakdown/expense-breakdown.component';
import { MonthlyStatementComponent } from './monthly-statement/monthly-statement.component';

export const routes: Routes = [
    { path: 'budget-dashboard', component: BudgetDashboardComponent },
	{ path: 'expense-breakdown', component: ExpenseBreakdownComponent },
	{ path: 'monthly-statement/:monthId', component: MonthlyStatementComponent },
	{ path: '**', redirectTo: 'budget-dashboard', pathMatch: 'full' },
];
