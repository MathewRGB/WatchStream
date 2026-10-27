// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('shows the title, status, actions and stage', () => {
    render(
      <AppShell
        title="WatchStream"
        status="Hosting as user1"
        actions={<button>End</button>}
        stage={<p>the stage</p>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'WatchStream' })).toBeInTheDocument();
    expect(screen.getByText('Hosting as user1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument();
    expect(screen.getByText('the stage')).toBeInTheDocument();
  });

  it('has no sidebar and no toggle without a sidebar', () => {
    render(<AppShell title="WatchStream" stage={<p>the stage</p>} />);

    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByTestId('sidebar-toggle')).toBeNull();
  });

  it('shows the sidebar next to the stage', () => {
    render(<AppShell title="WatchStream" stage={<p>stage</p>} sidebar={<p>side</p>} />);

    expect(screen.getByTestId('sidebar')).toHaveTextContent('side');
    expect(screen.getByTestId('sidebar-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses and restores the sidebar', async () => {
    render(<AppShell title="WatchStream" stage={<p>stage</p>} sidebar={<p>side</p>} />);

    await userEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.getByTestId('sidebar-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('stage')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('fills the window without letting the page scroll', () => {
    render(<AppShell title="WatchStream" stage={<p>stage</p>} sidebar={<p>side</p>} />);

    const shell = screen.getByTestId('app-shell');
    expect(shell).toHaveClass('h-dvh', 'overflow-hidden');
  });
});
