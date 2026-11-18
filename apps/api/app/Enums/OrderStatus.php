<?php

namespace App\Enums;

enum OrderStatus: string
{
    case Open = 'open';
    case Completed = 'completed';
    case Voided = 'voided';

    public function label(): string
    {
        return match ($this) {
            self::Open => 'Open',
            self::Completed => 'Completed',
            self::Voided => 'Voided',
        };
    }
}
