/** @vitest-environment jsdom */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfileDialog } from './ProfileDialog';
import { profileSchema, type Profile } from '../../domain/profile';

const ISO = '2026-01-01T00:00:00.000Z';

function existingProfile(): Profile {
  return profileSchema.parse({
    type: 'role',
    name: 'Production read-only',
    accountId: '123456789012',
    roleName: 'team/ReadOnlyRole',
    partition: 'aws',
    environment: 'production',
    favorite: false,
    tags: ['platform'],
    id: crypto.randomUUID(),
    listId: '00000000-0000-4000-8000-000000000001',
    colorId: 'rose',
    createdAt: ISO,
    updatedAt: ISO,
  });
}

function setup(profile: Profile | null = null) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<ProfileDialog profile={profile} onClose={onClose} onSave={onSave} />);
  return { onSave, onClose, user: userEvent.setup() };
}

function field(label: string | RegExp): HTMLElement {
  return screen.getByLabelText(label);
}

describe('ProfileDialog — accessibility wiring', () => {
  it('opens as a modal named by its heading', () => {
    setup();
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.getAttribute('aria-labelledby')).toBe('profile-dialog-title');
    expect(document.getElementById('profile-dialog-title')?.textContent).toBe('Add an AWS profile');
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('names the dialog after the profile being edited', () => {
    setup(existingProfile());
    expect(document.getElementById('profile-dialog-title')?.textContent).toBe(
      'Production read-only',
    );
  });

  it('links a validation error to its input and announces it', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Add profile' }));

    const name = field('Profile name');
    await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'));

    const describedBy = name.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const description = document.getElementById(describedBy!);
    expect(description?.getAttribute('role')).toBe('alert');
    expect(description?.textContent).toBe('Profile name is required.');
  });

  it('describes a field by its hint while it is valid', () => {
    setup();
    const tags = field('Tags');
    const describedBy = tags.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'Separate up to eight tags with commas.',
    );
  });

  it('replaces the hint with the error once validation fails', async () => {
    const { user } = setup();

    await user.type(field('Profile name'), 'Valid name');
    await user.type(field('Account ID or alias'), '123456789012');
    await user.type(field('Role name or path'), 'Role');
    await user.type(field('Tags'), 'a'.repeat(25));
    await user.click(screen.getByRole('button', { name: 'Add profile' }));

    await waitFor(() => {
      const tags = field('Tags');
      const describedBy = tags.getAttribute('aria-describedby');
      expect(document.getElementById(describedBy!)?.getAttribute('role')).toBe('alert');
    });
    expect(screen.queryByText('Separate up to eight tags with commas.')).toBeNull();
  });

  it('clears the error as soon as the field is edited again', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Add profile' }));
    await waitFor(() => expect(field('Profile name').getAttribute('aria-invalid')).toBe('true'));

    await user.type(field('Profile name'), 'A');
    expect(field('Profile name').getAttribute('aria-invalid')).toBe('false');
  });

  it('exposes browser-level input limits and account guidance', async () => {
    const { user } = setup();

    const iamAccount = field('Account ID or alias');
    expect(iamAccount.getAttribute('maxlength')).toBe('63');
    expect(document.getElementById(iamAccount.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Enter exactly 12 digits, or a 3–63 character lowercase account alias.',
    );
    expect(field('Role name or path').getAttribute('maxlength')).toBe('64');
    expect(field('Landing region').getAttribute('maxlength')).toBe('32');
    expect(field('Tags').getAttribute('maxlength')).toBe('255');

    await user.click(screen.getByRole('button', { name: 'Identity Center' }));
    const ssoAccount = field('AWS account ID');
    expect(ssoAccount.getAttribute('maxlength')).toBe('12');
    expect(document.getElementById(ssoAccount.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Enter exactly 12 digits.',
    );
    expect(field('AWS access portal URL').getAttribute('maxlength')).toBe('2048');
  });
});

describe('ProfileDialog — profile color', () => {
  it('opens from the palette button and exposes automatic plus eight pastel colors', async () => {
    const { user } = setup();

    expect(screen.queryByRole('radio', { name: 'Soft lilac' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Choose profile color' }));

    expect(screen.getAllByRole('radio')).toHaveLength(9);
    expect(screen.getByRole('radio', { name: 'Automatic' })).toHaveProperty('checked', true);
  });

  it('submits and previews a manually selected color', async () => {
    const { onSave, user } = setup();

    await user.type(field('Profile name'), 'Custom color');
    await user.type(field('Account ID or alias'), '123456789012');
    await user.type(field('Role name or path'), 'ReadOnly');
    await user.click(screen.getByRole('button', { name: 'Choose profile color' }));
    await user.click(screen.getByRole('radio', { name: 'Soft lilac' }));

    expect(screen.getByText(/Soft lilac · selected manually/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Add profile' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ colorId: 'lilac' });
  });

  it('preselects the stored color while editing and can return to automatic assignment', async () => {
    const { onSave, user } = setup(existingProfile());

    await user.click(screen.getByRole('button', { name: 'Choose profile color' }));
    expect(screen.getByRole('radio', { name: 'Soft rose' })).toHaveProperty('checked', true);
    await user.click(screen.getByRole('radio', { name: 'Automatic' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('colorId');
  });
});

describe('ProfileDialog — connection type', () => {
  it('offers IAM role and Identity Center as a pressed-state pair', () => {
    setup();
    expect(screen.getByRole('button', { name: 'IAM role' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Identity Center' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('swaps partition for portal while keeping the shared landing region', async () => {
    const { user } = setup();

    expect(screen.getByLabelText('AWS partition')).toBeDefined();
    expect(screen.getByLabelText('Landing region')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Identity Center' }));

    expect(screen.queryByLabelText('AWS partition')).toBeNull();
    expect(screen.getByLabelText('AWS access portal URL')).toBeDefined();
    expect(screen.getByLabelText('Landing region')).toBeDefined();
    expect(screen.getByLabelText('AWS account ID')).toBeDefined();
  });
});

describe('ProfileDialog — saving', () => {
  it('submits a normalized role draft', async () => {
    const { onSave, user } = setup();

    await user.type(field('Profile name'), '  Production read-only  ');
    await user.type(field('Account ID or alias'), ' 123456789012 ');
    await user.type(field('Role name or path'), ' team/ReadOnlyRole ');
    await user.type(field('Tags'), ' platform , PLATFORM , payments ');
    await user.click(screen.getByRole('button', { name: 'Add profile' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      type: 'role',
      name: 'Production read-only',
      accountId: '123456789012',
      roleName: 'team/ReadOnlyRole',
      partition: 'aws',
      favorite: false,
    });
  });

  it('submits an optional IAM landing region', async () => {
    const { onSave, user } = setup();

    await user.type(field('Profile name'), 'Regional role');
    await user.type(field('Account ID or alias'), '123456789012');
    await user.type(field('Role name or path'), 'ReadOnly');
    await user.type(field('Landing region'), 'EU-WEST-1');
    await user.click(screen.getByRole('button', { name: 'Add profile' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ type: 'role', region: 'eu-west-1' });
  });

  it('rejects a portal URL that is not an AWS access portal', async () => {
    const { onSave, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Identity Center' }));
    await user.type(field('Profile name'), 'Phishy');
    await user.type(field('AWS account ID'), '123456789012');
    await user.type(field('Permission set'), 'ReadOnly');
    await user.type(field('AWS access portal URL'), 'https://phish.example.com/start');
    await user.click(screen.getByRole('button', { name: 'Add profile' }));

    await waitFor(() =>
      expect(
        screen.getByText('Use a valid HTTPS AWS access portal URL ending in /start.'),
      ).toBeDefined(),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('surfaces a save failure as an alert without closing the dialog', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('This account and role already exists.'));
    const onClose = vi.fn();
    render(<ProfileDialog profile={null} onClose={onClose} onSave={onSave} />);
    const user = userEvent.setup();

    await user.type(field('Profile name'), 'Duplicate');
    await user.type(field('Account ID or alias'), '123456789012');
    await user.type(field('Role name or path'), 'Role');
    await user.click(screen.getByRole('button', { name: 'Add profile' }));

    await waitFor(() =>
      expect(screen.getByText('This account and role already exists.')).toBeDefined(),
    );
    expect(screen.getByText('This account and role already exists.').getAttribute('role')).toBe(
      'alert',
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('pre-fills every field when editing and keeps the tags order', () => {
    setup(existingProfile());
    expect(field('Profile name')).toHaveProperty('value', 'Production read-only');
    expect(field('Account ID or alias')).toHaveProperty('value', '123456789012');
    expect(field('Role name or path')).toHaveProperty('value', 'team/ReadOnlyRole');
    expect(field('Tags')).toHaveProperty('value', 'platform');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDefined();
  });

  it('closes without saving when Cancel is pressed', async () => {
    const { onSave, onClose, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('closes from the header close button', async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks the favorite checkbox from the profile', () => {
    setup();
    const favorite = within(screen.getByRole('dialog', { hidden: true })).getByRole('checkbox');
    expect(favorite).toHaveProperty('checked', false);
  });
});
