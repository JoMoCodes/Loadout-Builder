// The Help button at the top of every page: the page's tour, How to use, and the help forum.

import {
  BookOpen,
  CircleHelp,
  ListChecks,
  MessageCircleQuestionMark,
  Signpost,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { TOURS } from './tours';

interface HelpMenuProps {
  /** The tour for what is on screen, or null when this page has none. */
  tourName: string | null;
  onTour(): void;
  onHowToUse(): void;
  checklistShown: boolean;
  onShowChecklist(): void;
  onAsk(): void;
}

export function HelpMenu({
  tourName,
  onTour,
  onHowToUse,
  checklistShown,
  onShowChecklist,
  onAsk,
}: HelpMenuProps) {
  const tour = tourName ? TOURS[tourName] : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" data-testid="help-menu" aria-label="Help">
          <CircleHelp aria-hidden="true" />
          Help
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Help">
        <DropdownMenuItem
          disabled={!tour}
          onSelect={onTour}
          data-testid="take-tour"
          title={tour ? `A short tour of ${tour.label}` : undefined}
        >
          <Signpost aria-hidden="true" />
          {tour ? 'Take the tour of this page' : 'This page has no tour'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onHowToUse} data-testid="help-how-to-use">
          <BookOpen aria-hidden="true" />
          How to use
        </DropdownMenuItem>
        {checklistShown ? null : (
          <DropdownMenuItem onSelect={onShowChecklist} data-testid="help-show-checklist">
            <ListChecks aria-hidden="true" />
            Show the checklist again
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAsk} data-testid="help-ask">
          <MessageCircleQuestionMark aria-hidden="true" />
          Ask a question
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
