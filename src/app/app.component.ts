import { CommonModule, Location } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './auth.service';
import { BudgetStateService } from './budget-state.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Budget-Manager';
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly budgetState = inject(BudgetStateService);

  // Navigation history for back/forward arrows
  private history: string[] = [];
  private historyIndex = signal(-1);

  breadcrumb = signal<Array<{ label: string; url: string }>>([]);
  canGoBack = signal(false);
  canGoForward = signal(false);

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const url = e.urlAfterRedirects;
        // Trim forward history on new navigation
        const idx = this.historyIndex();
        this.history = this.history.slice(0, idx + 1);
        this.history.push(url);
        this.historyIndex.set(this.history.length - 1);
        this.canGoBack.set(this.historyIndex() > 0);
        this.canGoForward.set(false);
        this.breadcrumb.set(this.buildBreadcrumb(url));
      });
  }

  private buildBreadcrumb(url: string): Array<{ label: string; url: string }> {
    const crumbs: Array<{ label: string; url: string }> = [
      { label: 'Dashboard', url: '/budget-dashboard' },
    ];
    if (url.startsWith('/expense-breakdown')) {
      crumbs.push({ label: 'Expense Breakdown', url: '/expense-breakdown' });
    } else if (url.startsWith('/monthly-statement')) {
      crumbs.push({ label: 'Expense Breakdown', url: '/expense-breakdown' });
      const monthId = url.split('/').pop() ?? '';
      const month = this.budgetState.months().find((m) => m.id === monthId);
      crumbs.push({ label: month?.label ?? monthId, url });
    }
    return crumbs;
  }

  navigateBack() {
    const idx = this.historyIndex();
    if (idx <= 0) return;
    const newIdx = idx - 1;
    this.historyIndex.set(newIdx);
    this.canGoBack.set(newIdx > 0);
    this.canGoForward.set(true);
    this.breadcrumb.set(this.buildBreadcrumb(this.history[newIdx]));
    this.router.navigateByUrl(this.history[newIdx]);
  }

  navigateForward() {
    const idx = this.historyIndex();
    if (idx >= this.history.length - 1) return;
    const newIdx = idx + 1;
    this.historyIndex.set(newIdx);
    this.canGoBack.set(newIdx > 0);
    this.canGoForward.set(newIdx < this.history.length - 1);
    this.breadcrumb.set(this.buildBreadcrumb(this.history[newIdx]));
    this.router.navigateByUrl(this.history[newIdx]);
  }

  logout() {
    this.authService.logout();
    this.history = [];
    this.historyIndex.set(-1);
    this.canGoBack.set(false);
    this.canGoForward.set(false);
  }
}
