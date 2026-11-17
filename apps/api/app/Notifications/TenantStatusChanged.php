<?php

namespace App\Notifications;

use App\Models\Tenant;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TenantStatusChanged extends Notification
{
    use Queueable;

    public const APPROVED = 'approved';

    public const SUSPENDED = 'suspended';

    public const REACTIVATED = 'reactivated';

    public function __construct(
        public Tenant $tenant,
        public string $outcome,
        public ?string $reason = null,
    ) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $workspace = rtrim((string) config('app.frontend_url'), '/');

        $message = (new MailMessage)
            ->subject($this->subjectLine())
            ->greeting('Hello '.$notifiable->name.',')
            ->line($this->bodyLine());

        if ($this->outcome === self::SUSPENDED && $this->reason) {
            $message->line('Reason: '.$this->reason);
        }

        if ($this->outcome !== self::SUSPENDED) {
            $message->action('Open your workspace', $workspace.'/login');
        }

        return $message->line('— The Restaurant POS team');
    }

    private function subjectLine(): string
    {
        return match ($this->outcome) {
            self::APPROVED => $this->tenant->name.' is approved',
            self::SUSPENDED => $this->tenant->name.' has been suspended',
            self::REACTIVATED => $this->tenant->name.' is active again',
        };
    }

    private function bodyLine(): string
    {
        return match ($this->outcome) {
            self::APPROVED => 'Good news: '.$this->tenant->name.' has been approved and your workspace is ready.',
            self::SUSPENDED => $this->tenant->name.' has been suspended, so the workspace is temporarily unavailable.',
            self::REACTIVATED => $this->tenant->name.' has been reactivated. You can use the workspace again.',
        };
    }
}
