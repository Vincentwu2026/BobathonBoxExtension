import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/card';
import { deleteFile, setPermissions } from '@/services/fileService';
import { userMessage } from '@/services/errors';
import type { DocumentItem } from '@/types';

const EMAIL = /^[^\s@,;]+@[^\s@,;]+$/;

/**
 * Permissions and delete for one demo file. The server makes the real decision: a file with collaborators or a
 * do-not-delete flag is refused there, whatever this page does. The page only explains it.
 */
export function ManageFile({ doc, onChanged, onDeleted }: { doc: DocumentItem; onChanged: (doc: DocumentItem) => void; onDeleted: () => void }) {
  const [owner, setOwner] = useState(doc.owner);
  const [people, setPeople] = useState<string[]>(doc.collaborators.map((c) => c.email));
  const [newPerson, setNewPerson] = useState('');
  const [doNotDelete, setDoNotDelete] = useState(doc.retention.hasDoNotDeleteFlag);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Start again from the saved values whenever a different file is opened or the saved values change.
  useEffect(() => {
    setOwner(doc.owner);
    setPeople(doc.collaborators.map((c) => c.email));
    setDoNotDelete(doc.retention.hasDoNotDeleteFlag);
    setNewPerson('');
    setFormError(null);
    setConfirming(false);
  }, [doc]);

  const save = useMutation({
    mutationFn: (collaborators: string[]) => setPermissions(doc.id, { owner: owner.trim(), collaborators, doNotDelete }),
    onSuccess: (updated) => onChanged(updated),
  });
  const remove = useMutation({
    mutationFn: () => deleteFile(doc.id),
    onSuccess: onDeleted,
    onSettled: () => setConfirming(false),
  });

  const addPerson = (e?: FormEvent) => {
    e?.preventDefault();
    const email = newPerson.trim();
    if (!email) return;
    if (!EMAIL.test(email)) return setFormError('Enter an email address like name@company.com.');
    if (!people.some((p) => p.toLowerCase() === email.toLowerCase())) setPeople([...people, email]);
    setNewPerson('');
    setFormError(null);
  };

  // Save always saves. An address still sitting in the "add" box is included, or explained if it is not valid.
  const onSave = () => {
    const email = newPerson.trim();
    if (email && !EMAIL.test(email)) return setFormError('Enter an email address like name@company.com.');
    setFormError(null);
    const list = email && !people.some((p) => p.toLowerCase() === email.toLowerCase()) ? [...people, email] : people;
    setPeople(list);
    setNewPerson('');
    save.mutate(list);
  };

  const protectedFile = doc.retention.status !== 'unprotected';

  return (
    <details className="rounded-lg border border-border bg-muted/30 px-4 py-3" data-testid="manage-file">
      <summary className="cursor-pointer text-sm font-medium">Permissions and delete</summary>

      <div className="mt-3 space-y-4">
        <div>
          <label htmlFor="owner-input" className="text-xs font-medium text-muted-foreground">
            Owner
          </label>
          <Input id="owner-input" type="email" value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={254} className="mt-1" />
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">People with access (collaborators)</p>
          {people.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">Nobody else has access.</p>
          ) : (
            <ul className="mt-1 space-y-1" data-testid="collaborator-list">
              {people.map((p) => (
                <li key={p} className="flex items-center justify-between gap-2 rounded-md bg-card px-3 py-1.5 text-sm">
                  <span className="min-w-0 break-all">{p}</span>
                  <button
                    type="button"
                    onClick={() => setPeople(people.filter((x) => x !== p))}
                    aria-label={`Remove ${p}`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addPerson} noValidate className="mt-2 flex gap-2">
            <Input
              type="email"
              value={newPerson}
              onChange={(e) => setNewPerson(e.target.value)}
              placeholder="Add someone by email"
              aria-label="Add a collaborator by email"
              maxLength={254}
            />
            <Button type="submit" variant="outline" size="md" disabled={people.length >= 20}>
              Add
            </Button>
          </form>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={doNotDelete} onChange={(e) => setDoNotDelete(e.target.checked)} className="h-4 w-4" />
          Do not delete this file
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onSave} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save permissions'}
          </Button>
          {save.isSuccess && <span className="text-sm text-muted-foreground" role="status">Saved.</span>}
        </div>
        {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
        {save.isError && <p className="text-sm text-destructive" role="alert">{userMessage(save.error)}</p>}

        <div className="border-t border-border pt-4">
          {protectedFile && (
            <p className="mb-2 text-sm text-muted-foreground" data-testid="delete-hint">
              This file is protected, so it cannot be deleted. To delete it, remove all collaborators and untick “Do not delete”, then save.
            </p>
          )}
          {!confirming ? (
            <Button variant="destructive" onClick={() => setConfirming(true)} disabled={protectedFile || remove.isPending}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete file
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2" role="alertdialog" aria-label="Confirm delete">
              <span className="text-sm">Delete “{doc.name}”? This cannot be undone.</span>
              <Button variant="destructive" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
                {remove.isPending ? 'Deleting…' : 'Yes, delete'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={remove.isPending}>
                Cancel
              </Button>
            </div>
          )}
          {remove.isError && <p className="mt-2 text-sm text-destructive" role="alert">{userMessage(remove.error)}</p>}
        </div>
      </div>
    </details>
  );
}
