'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Contact } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact;
  onSave: (contact: Contact) => void;
}

const emptyForm = { name: '', role: '', company: '', phone: '', email: '' };

export function ContactDialog({ open, onOpenChange, contact, onSave }: Props) {
  const isEdit = !!contact;
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      setForm(contact ? { ...contact, phone: contact.phone || '', email: contact.email || '', company: contact.company || '' } : emptyForm);
    }
  }, [open, contact]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.role.trim()) return;
    onSave({
      name: form.name.trim(),
      role: form.role.trim(),
      company: form.company.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
    } as Contact);
    onOpenChange(false);
  };

  const u = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update contact information.' : 'Add a site contact for this project.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ct-name">Name *</Label>
              <Input id="ct-name" placeholder="e.g. John Smith" value={form.name} onChange={e => u('name', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ct-role">Role *</Label>
              <Input id="ct-role" placeholder="e.g. GC, TAB, Mechanical" value={form.role} onChange={e => u('role', e.target.value)} required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ct-company">Company</Label>
              <Input id="ct-company" placeholder="e.g. ABC Mechanical" value={form.company} onChange={e => u('company', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ct-phone">Phone</Label>
              <Input id="ct-phone" type="tel" placeholder="e.g. 555-123-4567" value={form.phone} onChange={e => u('phone', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ct-email">Email</Label>
              <Input id="ct-email" type="email" placeholder="e.g. john@company.com" value={form.email} onChange={e => u('email', e.target.value)} />
            </div>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!form.name.trim() || !form.role.trim()}>
              {isEdit ? 'Save Changes' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
