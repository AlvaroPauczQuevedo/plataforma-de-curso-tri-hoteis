"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  Trash2,
  Pencil,
  FileText,
  Video,
  BookOpen,
  FileQuestion,
} from "lucide-react";
import type { Lesson, Module } from "@prisma/client";
import { LessonForm, type ProvaDisponivel } from "@/components/admin/lesson-form";
import { ActionButton } from "@/components/shared/action-button";
import { Badge } from "@/components/ui/badge";
import {
  createModule,
  updateModuleTitle,
  deleteModule,
  reorderModules,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
} from "@/lib/actions/courses";

type LessonWithFiles = Lesson & {
  videoFile?: { originalName: string } | null;
  pdfFile?: { originalName: string } | null;
};
type ModuleWithLessons = Module & { lessons: LessonWithFiles[] };

const lessonIcon = { VIDEO: Video, PDF: FileText, TEXT: BookOpen, PROVA: FileQuestion };

export function ModuleLessonBuilder({
  courseId,
  modules,
  provas = [],
}: {
  courseId: string;
  modules: ModuleWithLessons[];
  provas?: ProvaDisponivel[];
}) {
  const [order, setOrder] = useState(modules.map((m) => m.id));
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setOrder(modules.map((m) => m.id));
  }, [modules]);

  const modulesById = new Map(modules.map((m) => [m.id, m]));
  const orderedModules = order.map((id) => modulesById.get(id)).filter(Boolean) as ModuleWithLessons[];

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    const newOrder = arrayMove(order, oldIndex, newIndex);
    setOrder(newOrder);
    startTransition(async () => {
      await reorderModules(courseId, newOrder);
      router.refresh();
    });
  }

  function handleAddModule() {
    if (!newModuleTitle.trim()) return;
    startTransition(async () => {
      await createModule(courseId, newModuleTitle.trim());
      setNewModuleTitle("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {orderedModules.map((module, idx) => (
              <SortableModuleCard
                key={module.id}
                module={module}
                index={idx}
                provas={provas}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex gap-2 rounded-2xl border border-dashed border-border bg-surface-muted/40 p-4">
        <input
          value={newModuleTitle}
          onChange={(e) => setNewModuleTitle(e.target.value)}
          placeholder="Nome do novo módulo (ex: Módulo 4 — Avaliação)"
          className="flex-1 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
        <button
          type="button"
          onClick={handleAddModule}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Novo módulo
        </button>
      </div>
    </div>
  );
}

function SortableModuleCard({
  module,
  index,
  provas,
}: {
  module: ModuleWithLessons;
  index: number;
  provas: ProvaDisponivel[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const [title, setTitle] = useState(module.title);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const router = useRouter();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`overflow-hidden rounded-2xl border border-border bg-white ${isDragging ? "shadow-lg opacity-90" : ""}`}
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface-muted/60 px-3 py-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1.5 text-ink-700/40 hover:bg-white hover:text-ink-700"
          title="Arrastar para reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="shrink-0 text-xs font-semibold text-ink-700/50">Módulo {index + 1}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title !== module.title) {
              updateModuleTitle(module.id, title.trim()).then(() => router.refresh());
            }
          }}
          className="flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-ink-900 outline-none focus:border-border focus:bg-white"
        />
        <ActionButton
          action={() => deleteModule(module.id)}
          variant="ghost"
          size="sm"
          confirmMessage="Excluir este módulo e todas as suas aulas?"
        >
          <Trash2 className="h-3.5 w-3.5 text-danger-600" />
        </ActionButton>
      </div>

      <div className="p-3">
        <LessonList module={module} provas={provas} />

        {showAddLesson ? (
          <div className="mt-3">
            <LessonForm
              provas={provas}
              action={(fd) => createLesson(module.id, fd)}
              onDone={() => {
                setShowAddLesson(false);
                router.refresh();
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddLesson(true)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-700/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar aula
          </button>
        )}
      </div>
    </div>
  );
}

function LessonList({
  module,
  provas,
}: {
  module: ModuleWithLessons;
  provas: ProvaDisponivel[];
}) {
  const [order, setOrder] = useState(module.lessons.map((l) => l.id));
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setOrder(module.lessons.map((l) => l.id));
  }, [module.lessons]);

  const byId = new Map(module.lessons.map((l) => [l.id, l]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as LessonWithFiles[];

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    const newOrder = arrayMove(order, oldIndex, newIndex);
    setOrder(newOrder);
    reorderLessons(module.id, newOrder).then(() => router.refresh());
  }

  if (ordered.length === 0) {
    return <p className="px-2 py-2 text-xs text-ink-700/50">Nenhuma aula neste módulo ainda.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1.5">
          {ordered.map((lesson) => (
            <SortableLessonRow key={lesson.id} lesson={lesson} provas={provas} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableLessonRow({
  lesson,
  provas,
}: {
  lesson: LessonWithFiles;
  provas: ProvaDisponivel[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lesson.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const Icon = lessonIcon[lesson.type];

  if (editing) {
    return (
      <li ref={setNodeRef} style={style}>
        <LessonForm
          lesson={lesson}
          provas={provas}
          action={(fd) => updateLesson(lesson.id, fd)}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
        />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-1 text-xs text-ink-700/60 hover:underline"
        >
          Cancelar
        </button>
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2.5 ${isDragging ? "shadow-md opacity-90" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded p-1 text-ink-700/30 hover:text-ink-700"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700/10 text-brand-700">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-900">{lesson.title}</span>
      {lesson.required ? (
        <Badge tone="navy" className="hidden sm:inline-flex">Obrigatória</Badge>
      ) : (
        <Badge tone="neutral" className="hidden sm:inline-flex">Opcional</Badge>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-lg p-1.5 text-ink-700/50 hover:bg-surface-muted hover:text-ink-900"
        title="Editar aula"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <ActionButton
        action={() => deleteLesson(lesson.id)}
        variant="ghost"
        size="sm"
        confirmMessage="Excluir esta aula?"
      >
        <Trash2 className="h-3.5 w-3.5 text-danger-600" />
      </ActionButton>
    </li>
  );
}
