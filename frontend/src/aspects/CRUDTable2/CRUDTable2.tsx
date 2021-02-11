import {
    Alert,
    AlertDescription,
    AlertDialog,
    AlertDialogBody,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogOverlay,
    AlertTitle,
    Box,
    Button,
    ButtonGroup,
    Center,
    chakra,
    Checkbox,
    Flex,
    FormControl,
    FormLabel,
    HStack,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    NumberInput,
    NumberInputField,
    Select,
    Spinner,
    Table,
    Tbody,
    Td,
    Text,
    Th,
    Thead,
    Tooltip,
    Tr,
    useDisclosure,
    useToken,
    VStack,
} from "@chakra-ui/react";
import React, {
    MutableRefObject,
    ReactNode,
    ReactNodeArray,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useRestorableState } from "../Generic/useRestorableState";
import FAIcon from "../Icons/FAIcon";

export type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

export enum SortDirection {
    Asc = "⬆",
    Dsc = "⬇",
}

export type FilterFunction<T, FV> = (rows: T[], filterValue: FV) => T[];

export interface ColumnHeaderProps<T> {
    visibleData: T[] | null;
    onClick: () => void;
    sortDir: SortDirection | null;
    isInCreate: boolean;
}

export interface FilterProps<FV = any> {
    value: FV | null;
    onChange: (newValue: FV | null) => void;
    onBlur: () => void;
}

export interface CellProps<T, V = any> {
    value: V;
    staleRecord: T;
    ref: ((instance: HTMLElement | null) => void) | MutableRefObject<HTMLElement | null> | null;
    onChange?: (newValue: V) => void;
    onBlur?: () => void;
    onKeyUp?: (ev: React.KeyboardEvent) => void;
    isInCreate: boolean;
    dependentData: Map<string, Record<string, any>>;
}

export interface ColumnSpecification<T, V = any, FV = V> {
    id: string;
    isDataDependency?: boolean;
    defaultSortDirection?: SortDirection;
    header: ReactNode | ReactNodeArray | React.FunctionComponent<ColumnHeaderProps<T>>;
    get: (record: Partial<T>) => V;
    set?: (record: DeepWriteable<Partial<T>>, value: V) => void;

    filterFn?: FilterFunction<T, FV>;
    filterEl?: (props: FilterProps<FV>) => ReactNode | ReactNodeArray;

    sort?: (valueA: V, valueB: V) => number;

    cell: (props: CellProps<Partial<T>, V>) => JSX.Element;
}

export interface RowSpecification<T> {
    getKey: (record: T) => string;
    colour?: (record: T) => string | undefined;

    canSelect?: (record: T) => boolean;

    warning?: (record: T) => string | undefined;

    pages?: {
        defaultToLast?: boolean;
    };
}

const CRUDCell = React.forwardRef(function CRUDCell(
    {
        isInCreate,
        initialValue,
        onUpdate,
        column,
        dependentData,
        record,
        backgroundColor,
    }: {
        isInCreate: boolean;
        initialValue: any;
        onUpdate?: (newValue: unknown) => void;
        column: ColumnSpecification<unknown, unknown, unknown>;
        dependentData: Map<string, Record<string, any>>;
        record: unknown;
        backgroundColor?: string;
    },
    ref: ((instance: HTMLElement | null) => void) | MutableRefObject<HTMLElement | null> | null
) {
    const [value, setValue] = useState<unknown>(initialValue);
    const updateTimeoutId = useRef<number | null>(null);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const [undoStack, setUndoStack] = useState<unknown[]>([]);

    const [backgroundColorToken] = useToken("colors", [backgroundColor ?? "white.400"]);
    const contents = column.cell({
        isInCreate,
        ref,
        value,
        onKeyUp:
            column.set &&
            ((ev) => {
                if (ev.ctrlKey && !ev.shiftKey && ev.key === "z" && undoStack.length > 0) {
                    ev.preventDefault();
                    ev.stopPropagation();

                    setUndoStack((old) => old.slice(0, old.length - 1));

                    const prev = undoStack[undoStack.length - 1];
                    setValue(prev);
                }
            }),
        onBlur:
            onUpdate &&
            column.set &&
            (() => {
                if (value !== initialValue) {
                    if (updateTimeoutId.current !== null) {
                        clearTimeout(updateTimeoutId.current);
                        updateTimeoutId.current = null;
                    }

                    onUpdate(value);
                }
            }),
        onChange:
            onUpdate &&
            column.set &&
            ((newValue) => {
                setValue(newValue);
                setUndoStack((p) => [...p, newValue].slice(Math.max(0, p.length - 10), p.length));

                if (updateTimeoutId.current !== null) {
                    clearTimeout(updateTimeoutId.current);
                    updateTimeoutId.current = null;
                }
                updateTimeoutId.current = setTimeout(
                    (() => {
                        updateTimeoutId.current = null;
                        if (newValue !== initialValue) {
                            onUpdate(newValue);
                        }
                    }) as TimerHandler,
                    1000
                );
            }),
        dependentData,
        staleRecord: record as Partial<unknown>,
    });

    return isInCreate ? (
        contents
    ) : (
        <Td
            size="sm"
            padding={1}
            minW="max-content"
            style={{ backgroundColor: backgroundColor ? backgroundColorToken : undefined }}
        >
            {contents}
        </Td>
    );
});

interface CRUDRowProps<T> {
    record: T;
    row: RowSpecification<T>;
    columns: ColumnSpecification<T>[];
    focusOnColumn: MutableRefObject<((columnId: string) => void) | null>;

    onSelectChange?: (isSelected: boolean) => void;
    beginInsert?: () => void;
    onUpdate?: (newRecord: T) => void;
    onDelete?: () => void;
    onSecondaryEdit?: () => void;

    getIsSelected?: MutableRefObject<(() => boolean) | null>;
    setIsSelected?: MutableRefObject<((selected: boolean | ((x: boolean) => boolean)) => void) | null>;

    dependentData: Map<string, Record<string, any>>;
}

function CRUDRow<T>({
    record,
    row,
    columns,
    focusOnColumn,
    onSelectChange,
    beginInsert,
    onUpdate,
    onDelete,
    onSecondaryEdit,
    getIsSelected: getIsSelectedRef,
    setIsSelected: setIsSelectedRef,
    dependentData,
}: CRUDRowProps<T>): JSX.Element {
    const refs = useMemo(() => columns.map((_column) => React.createRef<HTMLElement>()), [columns]);
    const doFocusOnColumn = useCallback(
        (columnId: string) => {
            const idx = columns.findIndex((column) => column.id === columnId);
            if (idx > -1) {
                refs[idx]?.current?.focus();
            }
        },
        [columns, refs]
    );
    focusOnColumn.current = doFocusOnColumn;
    const [localRecord, setLocalRecord] = useState<T>(record);
    useEffect(() => {
        setLocalRecord(record);
    }, [record]);

    const cellEls = useMemo(
        () =>
            columns.map((column, index) => {
                const colSet = column.set;
                return (
                    <CRUDCell
                        key={row.getKey(localRecord) + "_" + index}
                        isInCreate={false}
                        initialValue={column.get(localRecord)}
                        ref={refs[index]}
                        column={column as ColumnSpecification<unknown>}
                        onUpdate={
                            onUpdate &&
                            colSet &&
                            ((newValue) => {
                                const modified = { ...localRecord };
                                colSet(modified, newValue);
                                setLocalRecord(modified);
                                onUpdate(modified);
                            })
                        }
                        dependentData={dependentData}
                        record={localRecord}
                        backgroundColor={row.colour?.(localRecord)}
                    />
                );
            }),
        [columns, dependentData, localRecord, onUpdate, refs, row]
    );

    const [isSelected, setIsSelected] = useState<boolean>(false);
    const getIsSelectedCb = useCallback(() => isSelected, [isSelected]);
    if (getIsSelectedRef) {
        getIsSelectedRef.current = getIsSelectedCb;
    }
    if (setIsSelectedRef) {
        setIsSelectedRef.current = setIsSelected;
    }
    const selectEl = useMemo(
        () =>
            onSelectChange || getIsSelectedRef || setIsSelectedRef ? (
                <Td size="sm" padding={1}>
                    <Center w="100%" h="100%" padding={0}>
                        <Checkbox
                            aria-label="Select row"
                            isChecked={isSelected}
                            onChange={(ev) => {
                                setIsSelected(ev.target.checked);
                                onSelectChange?.(ev.target.checked);
                            }}
                        />
                    </Center>
                </Td>
            ) : undefined,
        [getIsSelectedRef, isSelected, onSelectChange, setIsSelectedRef]
    );

    const warning = useMemo(() => row.warning?.(localRecord), [localRecord, row]);
    const editEl = useMemo(
        () =>
            onSecondaryEdit ? (
                <Td size="sm" padding={1}>
                    <Center w="100%" h="100%" padding={0}>
                        <Tooltip label={warning ?? "Edit hidden fields"}>
                            <Button
                                aria-label="Edit hidden fields"
                                size="xs"
                                onClick={() => onSecondaryEdit()}
                                colorScheme={warning ? "orange" : "blue"}
                            >
                                {warning ? (
                                    <>
                                        <FAIcon iconStyle="s" icon="exclamation-triangle" mr={1} />
                                        <FAIcon iconStyle="s" icon="edit" />
                                    </>
                                ) : (
                                    <FAIcon iconStyle="s" icon="edit" />
                                )}
                            </Button>
                        </Tooltip>
                    </Center>
                </Td>
            ) : beginInsert ? (
                <Td></Td>
            ) : undefined,
        [beginInsert, onSecondaryEdit, warning]
    );

    const deleteEl = useMemo(
        () =>
            onDelete ? (
                <Td size="sm" padding={1}>
                    <Center w="100%" h="100%" padding={0}>
                        <Button aria-label="Delete row" colorScheme="red" size="xs" onClick={() => onDelete()}>
                            <FAIcon iconStyle="s" icon="trash-alt" />
                        </Button>
                    </Center>
                </Td>
            ) : undefined,
        [onDelete]
    );

    return (
        <>
            {selectEl}
            {editEl}
            {deleteEl}
            {cellEls}
        </>
    );
}

function CRUDColumnHeading<T, V = any, FV = V>({
    column,
    visibleData,
    applySorting,
    applyFilter,
}: {
    column: ColumnSpecification<T, V, FV>;
    visibleData: T[] | null;
    applySorting: (columnId: string, direction: SortDirection | null) => void;
    applyFilter: (columnId: string, value: any) => void;
}): JSX.Element {
    const [filterValue, setFilterValue] = useState<FV | null>(null);
    const filterChangeTimeoutId = useRef<number | null>(null);
    const [sortDir, setSortDir] = useState<SortDirection | null>(column.defaultSortDirection ?? null);

    // TODO: In future: Resizing
    // TODO: In future: Grouping

    return (
        <VStack justifyContent="flex-start" alignItems="stretch" h="100%">
            {typeof column.header === "function"
                ? column.header({
                      visibleData,
                      onClick: () => {
                          if (sortDir === SortDirection.Asc) {
                              setSortDir(SortDirection.Dsc);
                              applySorting(column.id, SortDirection.Dsc);
                          } else if (sortDir === SortDirection.Dsc) {
                              setSortDir(null);
                              applySorting(column.id, null);
                          } else {
                              setSortDir(SortDirection.Asc);
                              applySorting(column.id, SortDirection.Asc);
                          }
                      },
                      sortDir,
                      isInCreate: false,
                  })
                : column.header}
            {column.filterEl ? (
                <Box>
                    {column.filterEl({
                        value: filterValue,
                        onChange: (newV) => {
                            setFilterValue(newV);

                            if (filterChangeTimeoutId.current !== null) {
                                clearTimeout(filterChangeTimeoutId.current);
                                filterChangeTimeoutId.current = null;
                            }

                            filterChangeTimeoutId.current = setTimeout(
                                (() => {
                                    applyFilter(column.id, newV);
                                }) as TimerHandler,
                                250
                            );
                        },
                        onBlur: () => {
                            if (filterChangeTimeoutId.current !== null) {
                                clearTimeout(filterChangeTimeoutId.current);
                                filterChangeTimeoutId.current = null;
                            }
                            applyFilter(column.id, filterValue);
                        },
                    })}
                </Box>
            ) : undefined}
        </VStack>
    );
}

/**
 * The `data` is only the rendered subset of data
 */
function RenderedCRUDTable<T>({
    data,
    columns,
    row,

    applySorting,
    applyFilter,

    beginInsert,
    onEdit,
    onUpdate,
    onDelete,

    focusOnRow,

    dependentData,
}: {
    data: false | T[] | null;
    columns: ColumnSpecification<T>[];
    row: RowSpecification<T>;

    applySorting: (columnId: string, direction: SortDirection | null) => void;
    applyFilter: (columnId: string, value: any) => void;

    beginInsert?: () => void;
    onEdit?: (key: string) => void;
    onUpdate?: (newRecord: T) => void;
    onDelete?: (keys: string[]) => void;

    focusOnRow: MutableRefObject<((key: string, columnId: string) => void) | null>;

    dependentData: Map<string, Record<string, any>>;
}): JSX.Element {
    // Aggressively memoize everything to decouple rendering of subelements
    //
    // This helps to ensure that a change to the whole data set doesn't
    // require a re-render of all (potentially expensive) elements.

    const enableSelection = !!onDelete;
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    useEffect(() => {
        setSelectedKeys(new Set());
    }, [data]);

    const columnEls = useMemo(
        () =>
            data !== false
                ? columns.map((column) => (
                      <Th key={column.id} padding={1}>
                          <CRUDColumnHeading
                              column={column}
                              visibleData={data}
                              applyFilter={applyFilter}
                              applySorting={applySorting}
                          />
                      </Th>
                  ))
                : undefined,
        [applyFilter, applySorting, columns, data]
    );

    const rowFocusRefs = useMemo(
        () => (data ? data.map((_record) => React.createRef<((columnId: string) => void) | null>()) : []),
        [data]
    );
    const getIsSelectedRefs = useMemo(
        () => (data ? data.map((_record) => React.createRef<(() => boolean) | null>()) : []),
        [data]
    );
    const setIsSelectedRefs = useMemo(
        () =>
            data
                ? data.map((_record) =>
                      React.createRef<((value: boolean | ((x: boolean) => boolean)) => void) | null>()
                  )
                : [],
        [data]
    );

    const selectColumnEl = useMemo(
        () =>
            enableSelection ? (
                <Th padding={0}>
                    <Center w="100%" h="100%" padding={0}>
                        <Checkbox
                            isIndeterminate={!!data && selectedKeys.size > 0 && selectedKeys.size < data.length}
                            isChecked={!!data && selectedKeys.size === data.length}
                            onChange={
                                data
                                    ? (ev) => {
                                          if (ev.target.checked) {
                                              setSelectedKeys(new Set(data.map(row.getKey)));
                                              setIsSelectedRefs.forEach((ref) => ref?.current?.(true));
                                          } else {
                                              setSelectedKeys(new Set());
                                              setIsSelectedRefs.forEach((ref) => ref?.current?.(false));
                                          }
                                      }
                                    : undefined
                            }
                        />
                    </Center>
                </Th>
            ) : undefined,
        [data, enableSelection, row.getKey, selectedKeys.size, setIsSelectedRefs]
    );

    const editColumnEl = useMemo(
        () =>
            beginInsert ? (
                <Th padding={0}>
                    <Center w="100%" h="100%" padding={0}>
                        <Button
                            aria-label="Create row"
                            onClick={() => {
                                beginInsert();
                            }}
                            size="xs"
                            colorScheme="green"
                        >
                            <FAIcon iconStyle="s" icon="plus" />
                        </Button>
                    </Center>
                </Th>
            ) : undefined,
        [beginInsert]
    );

    const deleteColumnEl = useMemo(
        () =>
            onDelete ? (
                <Th padding={0}>
                    <Center w="100%" h="100%" padding={0}>
                        <Tooltip label={"Delete selected"}>
                            <Button
                                aria-label="Delete row"
                                onClick={() => {
                                    onDelete([...selectedKeys.values()]);
                                }}
                                size="xs"
                                colorScheme="red"
                                isDisabled={selectedKeys.size === 0}
                            >
                                <FAIcon iconStyle="s" icon="trash-alt" />
                            </Button>
                        </Tooltip>
                    </Center>
                </Th>
            ) : undefined,
        [onDelete, selectedKeys]
    );

    const doFocusOnRow = useCallback(
        (key, columnId) => {
            if (data) {
                const idx = data.findIndex((record) => row.getKey(record) === key);
                if (idx > -1) {
                    rowFocusRefs[idx]?.current?.(columnId);
                }
            }
        },
        [data, row, rowFocusRefs]
    );
    focusOnRow.current = doFocusOnRow;

    const rowEls = useMemo(
        () =>
            data
                ? data.map((record, index) => (
                      <Tr key={row.getKey(record)} size="sm">
                          <CRUDRow
                              record={record}
                              row={row}
                              columns={columns}
                              beginInsert={beginInsert}
                              // TODO: Should these be wrapped somehow to avoid accidental re-renders?
                              onSelectChange={
                                  enableSelection
                                      ? (isSelected) => {
                                            const key = row.getKey(record);
                                            setSelectedKeys((old) => {
                                                const newKeys = new Set(old);
                                                if (isSelected) {
                                                    newKeys.add(key);
                                                } else {
                                                    newKeys.delete(key);
                                                }
                                                return newKeys;
                                            });
                                        }
                                      : undefined
                              }
                              onSecondaryEdit={onEdit && (() => onEdit(row.getKey(record)))}
                              onUpdate={onUpdate}
                              onDelete={
                                  onDelete &&
                                  (() => {
                                      onDelete([row.getKey(record)]);
                                  })
                              }
                              focusOnColumn={rowFocusRefs[index]}
                              getIsSelected={getIsSelectedRefs[index]}
                              setIsSelected={setIsSelectedRefs[index]}
                              dependentData={dependentData}
                          />
                      </Tr>
                  ))
                : undefined,
        [
            beginInsert,
            columns,
            data,
            dependentData,
            enableSelection,
            getIsSelectedRefs,
            onDelete,
            onEdit,
            onUpdate,
            row,
            rowFocusRefs,
            setIsSelectedRefs,
        ]
    );

    const noDataEl = useMemo(
        () =>
            data === null ? (
                <Tr>
                    <Td colSpan={9} size="sm">
                        <Center m={2}>
                            <Text>No data</Text>
                        </Center>
                    </Td>
                </Tr>
            ) : undefined,
        [data]
    );

    const loadingDataEl = useMemo(
        () =>
            data === false ? (
                <Tr>
                    <Td colSpan={9} size="sm">
                        <Center m={2}>
                            <Spinner label="Loading schedule data" />
                        </Center>
                    </Td>
                </Tr>
            ) : undefined,
        [data]
    );

    return (
        <>
            <Table display="block" maxWidth="100%" width="auto" size="sm" variant="striped" overflow="auto">
                <Thead>
                    {selectColumnEl}
                    {editColumnEl}
                    {deleteColumnEl}
                    {columnEls}
                </Thead>
                <Tbody>
                    {rowEls}
                    {noDataEl}
                    {loadingDataEl}
                </Tbody>
            </Table>
        </>
    );
}

type PageIndex = number | null;
type Sortings = Record<string, SortDirection>;
type Filters = Record<string, any>;

function computeSortedData<T>(columns: ColumnSpecification<T>[], sortColumns: Sortings, inputData: T[] | null | false) {
    const sortColumnIds = Object.keys(sortColumns);
    const sortings = sortColumnIds
        .map((columnId) => ({
            spec: columns.find((column) => column.id === columnId) as ColumnSpecification<T>,
            dir: sortColumns[columnId],
        }))
        .filter((x) => !!x.spec && !!x.spec.sort);
    return sortings.reduceRight<T[] | null | false>(
        (records, sorting) =>
            !records
                ? records
                : records.sort((x, y) => {
                      const sortVal = sorting.spec.sort?.(sorting.spec.get(x), sorting.spec.get(y)) ?? 0;
                      return sorting.dir === SortDirection.Asc ? sortVal : -sortVal;
                  }) ?? null,
        inputData ? [...inputData] : inputData
    );
}

function computeFilteredData<T>(
    columns: ColumnSpecification<T>[],
    filterColumns: Filters,
    inputData: T[] | null | false
) {
    const filterColumnIds = Object.keys(filterColumns);
    const filters = filterColumnIds
        .map((columnId) => ({
            spec: columns.find((column) => column.id === columnId) as ColumnSpecification<T>,
            val: filterColumns[columnId],
        }))
        .filter((x) => !!x.spec && !!x.spec.filterFn);
    return inputData
        ? filters.reduce(
              (records, filter) =>
                  filter.val === null ? records : filter.spec.filterFn?.(records, filter.val) ?? records,
              [...inputData]
          )
        : inputData;
}

function computePaginatedData<T>(
    row: RowSpecification<T>,
    pageIndex: PageIndex,
    pageSize: number,
    inputData: T[] | null | false
) {
    if (inputData && row.pages) {
        if (pageIndex === null) {
            // Default page
            if (row.pages.defaultToLast) {
                const start = inputData.length - (inputData.length % pageSize);
                return inputData.slice(start, inputData.length);
            } else {
                return inputData.slice(0, Math.min(inputData.length, pageSize));
            }
        } else {
            // Use page index
            const start = pageIndex * pageSize;
            const end = (1 + pageIndex) * pageSize;
            const startBounded = Math.max(0, Math.min(start, inputData.length - (inputData.length % pageSize)));
            const endBounded = Math.min(end, inputData.length);
            return inputData.slice(startBounded, endBounded);
        }
    } else {
        return inputData;
    }
}

function clampPageIndex<T>(data: T[] | null | false, pageSize: number, index: PageIndex) {
    const pageCount = data ? Math.ceil(data.length / pageSize) : 1;
    return index !== null ? Math.max(0, Math.min(pageCount - 1, index)) : null;
}

function mergeData<T>(
    row: RowSpecification<T>,
    data: T[] | null | false,
    updatedData: React.MutableRefObject<Record<string, T>>
) {
    return !data
        ? data
        : data.map((record) => {
              const key = row.getKey(record);
              if (updatedData.current[key]) {
                  return updatedData.current[key];
              }
              return record;
          });
}

function CRUDInsertModal<T>({
    isOpen,
    onClose,
    onCreate,
    defaultData,
    row,
    columns,
    dependentData,
}: {
    row: RowSpecification<T>;
    columns: ColumnSpecification<T>[];
    defaultData: Partial<T>;
    isOpen: boolean;
    onClose: () => void;
    onCreate: (data: Partial<T>) => boolean;
    dependentData: Map<string, Record<string, any>>;
}): JSX.Element {
    const [newData, setNewData] = useState<Partial<T>>({});
    useEffect(() => {
        setNewData(defaultData);
    }, [defaultData]);

    const cellEls = useMemo(
        () =>
            columns.map((column, index) => {
                const colSet = column.set;
                return (
                    <FormControl key={row.getKey(newData as T) + "_" + index}>
                        <FormLabel>
                            {typeof column.header === "function"
                                ? column.header({
                                      onClick: () => {
                                          /* EMPTY */
                                      },
                                      sortDir: null,
                                      visibleData: [],
                                      isInCreate: true,
                                  })
                                : column.header}
                        </FormLabel>
                        <CRUDCell
                            isInCreate={true}
                            initialValue={column.get(newData as T)}
                            column={column as ColumnSpecification<unknown>}
                            onUpdate={
                                colSet &&
                                ((newValue) => {
                                    const modified = { ...newData };
                                    colSet(modified as T, newValue);
                                    setNewData(modified);
                                })
                            }
                            dependentData={dependentData}
                            record={newData}
                            backgroundColor={row.colour?.(newData as T)}
                        />
                    </FormControl>
                );
            }),
        [columns, dependentData, newData, row]
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>
                    Create new
                    <ModalCloseButton onClick={onClose} />
                </ModalHeader>
                <ModalBody>
                    <VStack spacing={4}>{cellEls}</VStack>
                </ModalBody>
                <ModalFooter>
                    <ButtonGroup>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button
                            colorScheme="green"
                            onClick={() => {
                                if (onCreate(newData)) {
                                    onClose();
                                }
                            }}
                        >
                            Create
                        </Button>
                    </ButtonGroup>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

/**
 * @template T The type of the data for a single record in the table.
 */
export default function CRUDTable<T>({
    data,
    alert,
    columns,
    row,
    tableUniqueName,
    forceReload,

    insert: insertProps,
    edit: editProps,
    update: updateProps,
    delete: deleteProps,
}: {
    data: false | T[] | null;
    alert?: {
        title: string;
        description: string;
        status: "info" | "warning" | "error";
    };
    columns: ColumnSpecification<T>[];
    row: RowSpecification<T>;
    tableUniqueName: string;
    forceReload?: React.MutableRefObject<() => void>;

    insert?: {
        generateDefaults: () => Partial<T>;
        makeWhole: (partialRecord: Partial<T>) => undefined | T;
        start: (record: T) => void;
        ongoing: boolean;
    };

    edit?: {
        open: (key: string) => void;
    };

    update?: {
        start: (record: T) => void;
        ongoing: boolean;
    };

    delete?: {
        start: (keys: string[]) => void;
        ongoing: boolean;
    };

    // TODO: Undo callback
    // TODO: Ongoing state of Undo

    // TODO: Extra buttons
}): JSX.Element {
    // We decouple the input data from the rendering so that changes don't immediately
    // result in UI updates
    const [currentData, setCurrentData] = useState<T[] | null | false>(false);

    const [sortColumns, setSortColumns] = useState<Sortings>(
        columns.reduce(
            (acc, col) => (col.defaultSortDirection ? { ...acc, [col.id]: col.defaultSortDirection } : acc),
            {}
        )
    );
    const [filterColumns, setFilterColumns] = useState<Filters>({});
    const [pageIndex, setPageIndex] = useState<PageIndex>(null);
    const [pageSize, setPageSize] = useRestorableState<number>(
        `CRUDTable_PageSize_${tableUniqueName}`,
        10,
        (x) => x.toString(),
        (x) => parseInt(x, 10)
    );

    const [sortedData, setSortedData] = useState<T[] | null | false>(false);
    const [filteredData, setFilteredData] = useState<T[] | null | false>(false);
    const [paginatedData, setPaginatedData] = useState<T[] | null | false>(false);

    const updatedData = useRef<Record<string, T>>({});
    const [dependentData, setDependentData] = useState<Map<string, Record<string, any>>>(new Map());

    // Initial load of data
    useEffect(() => {
        if (currentData === false && typeof data === "object") {
            setCurrentData(data);
            updatedData.current = {};

            const dependentColumns = columns.filter((x) => x.isDataDependency);
            const depData = new Map();
            data?.forEach((record) => {
                const result: Record<string, any> = {};
                dependentColumns.forEach((column) => {
                    result[column.id] = column.get(record);
                });
                depData.set(row.getKey(record), result);
            });
            setDependentData(depData);
        }
    }, [columns, currentData, data, row]);

    const forceReloadCb = useCallback(() => {
        if (typeof data === "object") {
            setCurrentData(data);
        } else {
            setCurrentData(null);
        }
        updatedData.current = {};
    }, [data]);
    if (forceReload) {
        forceReload.current = forceReloadCb;
    }

    // Only recompute each layer of data when needed...

    // Since sort order changes relatively infrequently when compared to filter
    // values, the sorting comes first in the stack. This means we sort all the
    // data - which is more expensive than sorting the filtered data - but
    // hopefully this is less frequent so is overall less expensive. This also
    // means the data doesn't need re-sorting after every change to a filter.

    useEffect(() => {
        const mergedData = mergeData(row, currentData, updatedData);
        const sorted = computeSortedData(columns, sortColumns, mergedData);
        setSortedData(sorted);
    }, [columns, currentData, row, sortColumns]);

    // Next we filter the data
    useEffect(() => {
        const mergedData = mergeData(row, sortedData, updatedData);
        const filtered = computeFilteredData(columns, filterColumns, mergedData);
        setFilteredData(filtered);
    }, [columns, filterColumns, row, sortedData]);

    // And finally we apply pagination
    useEffect(() => {
        const mergedData = mergeData(row, filteredData, updatedData);
        const clampedPageIndex = clampPageIndex(mergedData, pageSize, pageIndex);
        const paginated = computePaginatedData(row, clampedPageIndex, pageSize, mergedData);
        setPaginatedData(paginated);
    }, [filteredData, pageIndex, pageSize, row, sortedData]);

    const applySorting = useCallback((columnId: string, direction: SortDirection | null) => {
        if (direction === null) {
            setSortColumns((old) => {
                const newCols = { ...old };
                delete newCols[columnId];
                return newCols;
            });
        } else {
            setSortColumns((old) => {
                return { ...old, [columnId]: direction };
            });
        }
    }, []);

    const applyFilter = useCallback((columnId: string, value: any) => {
        if (value === null) {
            setFilterColumns((old) => {
                const newCols = { ...old };
                delete newCols[columnId];
                return newCols;
            });
        } else {
            setFilterColumns((old) => {
                return { ...old, [columnId]: value };
            });
        }
    }, []);

    const goToPage = useCallback(
        (nextIndex: PageIndex) => {
            setCurrentData(data);
            updatedData.current = {};
            setPageIndex(clampPageIndex(data, pageSize, nextIndex));
        },
        [data, pageSize]
    );

    const startInsert = insertProps?.start;
    const insertRecord = useCallback(
        (record: T) => {
            // TODO: Focus on new record (ref for focusOnRowWhenRendered)
            setPaginatedData((old) => (old ? [...old, record] : [record]));
            updatedData.current[row.getKey(record)] = record;
            setDependentData((old) => {
                const dependentColumns = columns.filter((x) => x.isDataDependency);
                if (dependentColumns.length > 0) {
                    const newMap = new Map(old);
                    const result: Record<string, any> = {};
                    dependentColumns.forEach((column) => {
                        result[column.id] = column.get(record);
                    });
                    newMap.set(row.getKey(record), result);
                    return newMap;
                } else {
                    return old;
                }
            });
            startInsert?.(record);
        },
        [columns, row, startInsert]
    );

    const startUpdate = updateProps?.start;
    const updateRecord = useCallback(
        (record: T) => {
            updatedData.current[row.getKey(record)] = record;
            setDependentData((old) => {
                const dependentColumns = columns.filter((x) => x.isDataDependency);
                if (dependentColumns.length > 0) {
                    let foundDifference = false;
                    const newMap = new Map(old);
                    const key = row.getKey(record);
                    const existing = newMap.get(key);
                    if (existing) {
                        dependentColumns.forEach((column) => {
                            const newVal = column.get(record);
                            foundDifference ||= existing[column.id] !== newVal;
                            existing[column.id] = newVal;
                        });
                    } else {
                        foundDifference = true;
                        const result: Record<string, any> = {};
                        dependentColumns.forEach((column) => {
                            result[column.id] = column.get(record);
                        });
                        newMap.set(key, result);
                    }
                    if (foundDifference) {
                        return newMap;
                    } else {
                        return old;
                    }
                } else {
                    return old;
                }
            });
            startUpdate?.(record);
        },
        [columns, row, startUpdate]
    );

    const startDelete = deleteProps?.start;
    const keysToDelete = useRef<string[]>([]);
    const { isOpen: isDeleteConfirmOpen, onOpen: onDeleteConfirmOpen, onClose: onDeleteConfirmClose } = useDisclosure();
    const beginDeleteRecords = useCallback(
        (keys: string[]) => {
            keysToDelete.current = keys;
            onDeleteConfirmOpen();
        },
        [onDeleteConfirmOpen]
    );
    const deleteRecords = useCallback(() => {
        const keys = keysToDelete.current;
        keysToDelete.current = [];
        setCurrentData((old) => (old ? old.filter((x) => !keys.includes(row.getKey(x))) : old));
        keys.forEach((key) => {
            delete updatedData.current[key];
        });
        setDependentData((old) => {
            const dependentColumns = columns.filter((x) => x.isDataDependency);
            if (dependentColumns.length > 0) {
                const newMap = new Map(old);
                keys.forEach((key) => {
                    newMap.delete(key);
                });
                return newMap;
            } else {
                return old;
            }
        });
        startDelete?.(keys);
    }, [columns, startDelete, row]);

    const { isOpen: isInsertModalOpen, onOpen: openInsertModal, onClose: closeInsertModal } = useDisclosure();
    const [defaultNewData, setDefaultNewData] = useState<Partial<T>>({});
    const beginInsert = useCallback(() => {
        if (insertProps) {
            setDefaultNewData(insertProps.generateDefaults());
            openInsertModal();
        }
    }, [insertProps, openInsertModal]);

    const focusOnRow = useRef<((key: string, columnId: string) => void) | null>(null);

    // De-couple the rendered table from any other changes (such as the ongoing CUD operation states)
    const renderedTable = useMemo(
        () => (
            <RenderedCRUDTable
                data={paginatedData}
                row={row}
                columns={columns}
                applySorting={applySorting}
                applyFilter={applyFilter}
                beginInsert={beginInsert}
                onEdit={editProps?.open}
                onUpdate={updateRecord}
                onDelete={beginDeleteRecords}
                focusOnRow={focusOnRow}
                dependentData={dependentData}
            />
        ),
        [
            applyFilter,
            applySorting,
            beginInsert,
            columns,
            beginDeleteRecords,
            dependentData,
            editProps?.open,
            paginatedData,
            row,
            updateRecord,
        ]
    );

    const pageCount = data && row.pages ? Math.ceil(data.length / pageSize) : 1;
    const pageNumber = pageIndex !== null ? pageIndex + 1 : row.pages?.defaultToLast ? pageCount : 1;
    const canPreviousPage = pageNumber > 1;
    const canNextPage = pageNumber < pageCount;

    const alertEl = useMemo(
        () =>
            alert ? (
                <Alert status={alert.status}>
                    <AlertTitle>{alert.title}</AlertTitle>
                    <AlertDescription>{alert.description}</AlertDescription>
                </Alert>
            ) : undefined,
        [alert]
    );

    // TODO: Undo stack for handling Ctrl+Z from the window-level onKeyUp

    // TODO: Insert modal (use: insertRecord)
    const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);
    return (
        <>
            {alertEl}
            <Center w="100%" h="100%" minH="1.4rem" flexWrap="wrap">
                {insertProps?.ongoing || updateProps?.ongoing || deleteProps?.ongoing ? (
                    <HStack>
                        <Spinner size="xs" label="Saving changes…" />
                        <Text fontSize="sm">Saving changes{"…"}</Text>
                    </HStack>
                ) : undefined}
            </Center>
            {renderedTable}
            <AlertDialog
                isOpen={isDeleteConfirmOpen}
                leastDestructiveRef={cancelDeleteRef}
                onClose={onDeleteConfirmClose}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            Delete?
                        </AlertDialogHeader>

                        <AlertDialogBody>Are you sure? You can&lsquo;t undo this action.</AlertDialogBody>

                        <AlertDialogFooter>
                            <Button ref={cancelDeleteRef} onClick={onDeleteConfirmClose}>
                                Cancel
                            </Button>
                            <Button
                                colorScheme="red"
                                onClick={() => {
                                    onDeleteConfirmClose();
                                    deleteRecords();
                                }}
                                ml={3}
                            >
                                Delete
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
            <CRUDInsertModal
                row={row}
                columns={columns}
                defaultData={defaultNewData}
                isOpen={isInsertModalOpen}
                onClose={closeInsertModal}
                onCreate={(d) => {
                    if (insertProps) {
                        const whole = insertProps.makeWhole(d);
                        if (whole !== undefined) {
                            insertRecord(whole);
                            return true;
                        }
                    }
                    return false;
                }}
                dependentData={dependentData}
            />
            <Flex justifyContent="center" alignItems="center" gridGap={2} flexDir="row" flexWrap="wrap">
                <ButtonGroup>
                    <Button onClick={() => goToPage(0)} disabled={!canPreviousPage}>
                        {"<<"}
                    </Button>
                    <Button onClick={() => goToPage(pageNumber - 2)} disabled={!canPreviousPage}>
                        {"<"}
                    </Button>
                    <Button onClick={() => goToPage(pageNumber)} disabled={!canNextPage}>
                        {">"}
                    </Button>
                    <Button onClick={() => goToPage(pageCount - 1)} disabled={!canNextPage}>
                        {">>"}
                    </Button>
                </ButtonGroup>
                <Box flexBasis="auto" flexShrink={0}>
                    Page{" "}
                    <chakra.strong>
                        {pageNumber} of {pageCount}
                    </chakra.strong>
                </Box>
                <HStack alignItems="center">
                    <chakra.span flexBasis="auto" flexShrink={0}>
                        | Go to page:{" "}
                    </chakra.span>
                    <NumberInput>
                        <NumberInputField
                            defaultValue={pageIndex ? pageIndex + 1 : 0}
                            onChange={(e) => {
                                const page = e.target.value ? Number(e.target.value) - 1 : 0;
                                goToPage(page);
                            }}
                            style={{ width: "100px" }}
                        />
                    </NumberInput>
                </HStack>
                <Select
                    value={pageSize}
                    onChange={(e) => {
                        setPageSize(Number(e.target.value));
                    }}
                    maxW={125}
                >
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                        <option key={pageSize} value={pageSize}>
                            Show {pageSize}
                        </option>
                    ))}
                </Select>
            </Flex>
        </>
    );
}