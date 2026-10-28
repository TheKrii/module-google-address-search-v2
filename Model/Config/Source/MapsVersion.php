<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;

class MapsVersion implements OptionSourceInterface
{
    public function toOptionArray(): array
    {
        return [
            ['value' => 'quarterly', 'label' => __('Quarterly (recommended for production)')],
            ['value' => 'weekly', 'label' => __('Weekly')],
        ];
    }
}
