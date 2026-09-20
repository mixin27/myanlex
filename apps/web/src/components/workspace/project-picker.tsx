'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FolderKanban } from 'lucide-react';
import type { Project } from '@/lib/platform-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ProjectPicker({
  organizationId,
  projects,
  selected,
}: {
  organizationId: string;
  projects: Project[];
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Select
      value={selected}
      items={projects.map((project) => ({
        value: project.id,
        label: project.name,
      }))}
      onValueChange={(value) => {
        if (value) {
          const query = new URLSearchParams({
            organization: organizationId,
            project: value,
          });
          for (const field of ['from', 'to']) {
            const date = params.get(field);
            if (date && pathname === '/usage') query.set(field, date);
          }
          router.push(`${pathname}?${query}`);
        }
      }}
    >
      <SelectTrigger
        aria-label="Select project"
        className="w-full justify-start gap-3 bg-white data-[size=default]:h-14 sm:w-80 [&>svg:last-child]:ml-auto"
      >
        <span className="rounded-md bg-emerald-50 p-2 text-emerald-800">
          <FolderKanban className="size-4" />
        </span>
        <span className="grid text-left">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Project
          </span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <span>{project.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {project.environment}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
