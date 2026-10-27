// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Sidebar, type SidebarTab } from './sidebar';

const tabs: SidebarTab[] = [
  { id: 'invite', label: 'Invite', icon: <i />, content: <input data-testid="draft" /> },
  { id: 'people', label: 'People', icon: <i />, count: 3, content: <p>three people</p> },
  { id: 'chat', label: 'Chat', icon: <i />, content: <p>messages</p> },
];

describe('Sidebar', () => {
  it('lists every tab and shows the default one', () => {
    render(<Sidebar tabs={tabs} defaultTab="people" />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Invite',
      'People3',
      'Chat',
    ]);
    expect(screen.getByRole('tab', { name: /People/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('three people')).toBeVisible();
  });

  it('switches tabs and hides the others', async () => {
    render(<Sidebar tabs={tabs} defaultTab="invite" />);

    await userEvent.click(screen.getByTestId('tab-chat'));

    // No stylesheet is loaded here; the CSS hides panels by this attribute. The
    // end-to-end layout test checks the real effect in a browser.
    expect(screen.getByTestId('tab-panel-chat')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('tab-panel-invite')).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByTestId('tab-panel-invite')).toBeInTheDocument();
  });

  it('keeps what was typed when the user switches away and back', async () => {
    render(<Sidebar tabs={tabs} defaultTab="invite" />);
    await userEvent.type(screen.getByTestId('draft'), 'WSR1.half-typed');

    await userEvent.click(screen.getByTestId('tab-chat'));
    await userEvent.click(screen.getByTestId('tab-invite'));

    expect(screen.getByTestId('draft')).toHaveValue('WSR1.half-typed');
  });

  it('shows a count only where one is given', () => {
    render(<Sidebar tabs={tabs} defaultTab="invite" />);

    expect(screen.getByTestId('tab-people')).toHaveTextContent('3');
    expect(screen.getByTestId('tab-chat')).not.toHaveTextContent(/\d/);
  });
});
