import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { BudgetDashboardComponent } from './budget-dashboard/budget-dashboard.component';
import { ExpenseBreakdownComponent } from './expense-breakdown/expense-breakdown.component';
import { LoginComponent } from './login/login.component';
import { MonthlyStatementComponent } from './monthly-statement/monthly-statement.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'budget-dashboard', component: BudgetDashboardComponent, canActivate: [authGuard] },
  { path: 'expense-breakdown', component: ExpenseBreakdownComponent, canActivate: [authGuard] },
  { path: 'monthly-statement/:monthId', component: MonthlyStatementComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'budget-dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'budget-dashboard' },
];
