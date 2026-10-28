<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;

class OnClear implements OptionSourceInterface
{
    public function toOptionArray(): array
    {
        return [
            ['value' => 'keep', 'label' => __('Keep populated fields')],
            ['value' => 'clear_filled', 'label' => __('Clear fields populated by the last selection')],
        ];
    }
}
