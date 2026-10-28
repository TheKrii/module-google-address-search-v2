<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\Config\Backend;

use Magento\Framework\App\Cache\TypeListInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Config\Value;
use Magento\Framework\Data\Collection\AbstractDb;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Model\Context;
use Magento\Framework\Model\ResourceModel\AbstractResource;
use Magento\Framework\Registry;
use Vaimo\GoogleAddressSearchV2\Model\Config\Source\Forms as FormsSource;

class Forms extends Value
{
    public function __construct(
        Context $context,
        Registry $registry,
        ScopeConfigInterface $config,
        TypeListInterface $cacheTypeList,
        private readonly FormsSource $formsSource,
        ?AbstractResource $resource = null,
        ?AbstractDb $resourceCollection = null,
        array $data = []
    ) {
        parent::__construct($context, $registry, $config, $cacheTypeList, $resource, $resourceCollection, $data);
    }

    public function beforeSave()
    {
        $value = $this->getValue();
        $forms = array_values(array_unique(array_filter(
            array_map('trim', is_array($value) ? $value : explode(',', (string)$value)),
            'strlen'
        )));
        $unknown = array_diff($forms, array_keys($this->formsSource->getForms()));

        if ($unknown !== []) {
            throw new LocalizedException(__('Unknown address search form(s): %1', implode(', ', $unknown)));
        }

        $this->setValue(implode(',', $forms));

        return parent::beforeSave();
    }
}
