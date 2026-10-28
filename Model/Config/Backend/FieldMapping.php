<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\Config\Backend;

use Magento\Config\Model\Config\Backend\Serialized\ArraySerialized;
use Magento\Framework\App\Cache\TypeListInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Data\Collection\AbstractDb;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Model\Context;
use Magento\Framework\Model\ResourceModel\AbstractResource;
use Magento\Framework\Registry;
use Magento\Framework\Serialize\Serializer\Json;
use Vaimo\GoogleAddressSearchV2\Model\FieldMapping\RowValidator;

class FieldMapping extends ArraySerialized
{
    public function __construct(
        Context $context,
        Registry $registry,
        ScopeConfigInterface $config,
        TypeListInterface $cacheTypeList,
        private readonly RowValidator $rowValidator,
        ?AbstractResource $resource = null,
        ?AbstractDb $resourceCollection = null,
        array $data = [],
        ?Json $serializer = null
    ) {
        parent::__construct(
            $context,
            $registry,
            $config,
            $cacheTypeList,
            $resource,
            $resourceCollection,
            $data,
            $serializer
        );
    }

    public function beforeSave()
    {
        $rows = $this->getValue();
        $clean = [];
        $errors = [];
        $line = 0;

        foreach (is_array($rows) ? $rows : [] as $id => $row) {
            if (!is_array($row)) {
                continue;
            }
            $line++;
            $row = [
                'form' => trim((string)($row['form'] ?? '')),
                'countries' => strtoupper(preg_replace('/\s+/', '', (string)($row['countries'] ?? ''))),
                'field' => trim((string)($row['field'] ?? '')),
                'template' => trim((string)($row['template'] ?? '')),
            ];
            foreach ($this->rowValidator->validate($row) as $error) {
                $errors[] = __('Field Mapping row %1: %2', $line, $error);
            }
            $clean[$id] = $row;
        }

        if ($errors !== []) {
            throw new LocalizedException(__(implode("\n", array_map('strval', $errors))));
        }

        $this->setValue($clean);

        return parent::beforeSave();
    }
}
