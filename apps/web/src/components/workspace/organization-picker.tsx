'use client';
import { useRouter } from 'next/navigation';
import type { Organization } from '@/lib/platform-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function OrganizationPicker({
  organizations,
  selected,
}: {
  organizations: Organization[];
  selected?: string;
}) {
  const router = useRouter();
  return (
    <div className="grid gap-2">
      <span id="organization-label">Organization</span>
      <Select
        value={selected ?? null}
        onValueChange={(value) => {
          if (value)
            router.push(`/projects?organization=${encodeURIComponent(value)}`);
        }}
        items={organizations.map((organization) => ({
          value: organization.id,
          label: organization.name,
        }))}
      >
        <SelectTrigger aria-labelledby="organization-label">
          <SelectValue placeholder="Choose an organization" />
        </SelectTrigger>
        <SelectContent>
          {organizations.map((organization) => (
            <SelectItem value={organization.id} key={organization.id}>
              {organization.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
