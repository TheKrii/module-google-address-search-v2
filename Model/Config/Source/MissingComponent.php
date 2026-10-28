<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;

class MissingComponent implements OptionSourceInterface
{
    public function toOptionArray(): array
    {
        return [
            ['value' => 'clear', 'label' => __('Clear the mapped field')],
            ['value' => 'keep', 'label' => __('Keep the current field value')],
        ];
    }
}
