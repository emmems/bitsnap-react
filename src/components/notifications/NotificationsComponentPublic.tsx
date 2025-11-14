import { useReducer, useRef, useEffect } from "react";
import { cn } from "@/src/lib/utils";
import { rpcProvider, RpcProvider, useMutation } from "src/rpc-provider";
import type {
  NotificationsComponentPublicProps,
  NotificationGroup,
  CustomizationTexts,
  ComponentClassNames,
} from "./types";
export type {
  NotificationGroup,
  CustomizationTexts,
  ComponentClassNames,
} from "./types";
import { DEFAULT_TEXTS } from "./constants";
import { NotificationHeader } from "./NotificationHeader";
import { NotificationGroupsList } from "./NotificationGroupsList";
import { QRCodeSection } from "./QRCodeSection";
import { AddUserToGroups } from "./AddUserToGroups";
import { ManageMyData } from "./ManageMyData";
import { getProjectID } from "../checkout/CartProvider";

interface State {
  isUserGroupsUpdated: boolean;
  wasChanged: boolean;
  groupChecked: Record<string, boolean>;
}

type Action =
  | { type: "TOGGLE_GROUP"; groupID: string }
  | { type: "CHECK_ALL_GROUPS" }
  | { type: "SET_WAS_CHANGED"; value: boolean }
  | { type: "SET_IS_USER_GROUPS_UPDATED"; value: boolean }
  | { type: "RESET_UPDATE_STATE" }
  | { type: "SET_GROUP_CHECKED"; value: Record<string, boolean> };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "TOGGLE_GROUP": {
      return {
        ...state,
        wasChanged: true,
        groupChecked: {
          ...state.groupChecked,
          [action.groupID]:
            typeof state.groupChecked[action.groupID] === "undefined"
              ? true
              : !state.groupChecked[action.groupID],
        },
      };
    }
    case "CHECK_ALL_GROUPS": {
      const updated = { ...state.groupChecked };
      Object.keys(updated).forEach((key) => {
        updated[key] = true;
      });
      return {
        ...state,
        groupChecked: updated,
      };
    }
    case "SET_WAS_CHANGED":
      return {
        ...state,
        wasChanged: action.value,
      };
    case "SET_IS_USER_GROUPS_UPDATED":
      return {
        ...state,
        isUserGroupsUpdated: action.value,
      };
    case "RESET_UPDATE_STATE":
      return {
        ...state,
        wasChanged: false,
        isUserGroupsUpdated: true,
      };
    case "SET_GROUP_CHECKED":
      return {
        ...state,
        groupChecked: action.value,
      };
    default:
      return state;
  }
}

function NotificationsComponentPublic(
  props: NotificationsComponentPublicProps,
) {
  const { mutateAsync: updateUserGroups, isPending: isUpdating } = useMutation(
    rpcProvider.notifications.updateUserGroups,
  );

  const [state, dispatch] = useReducer(reducer, {
    isUserGroupsUpdated: false,
    wasChanged: false,
    groupChecked: props.groupsChecked,
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync groupChecked with props.groupsChecked when it changes
  useEffect(() => {
    dispatch({ type: "SET_GROUP_CHECKED", value: props.groupsChecked });
  }, [props.groupsChecked]);

  const {
    texts,
    showQRCode = true,
    showPhoneInput = true,
    hiddenGroupIds = [],
    className,
  } = props;

  const mergedTexts = { ...DEFAULT_TEXTS, ...texts };
  let slug = props.slug ?? getProjectID() ?? (typeof window !== "undefined" ? window.location.hostname : "");

  async function updateGroups() {
    await updateUserGroups({
      slug: slug,
      userId: props.userID,
      groupIds: Object.entries(state.groupChecked)
        .filter(([, value]) => value === true)
        .map(([key]) => key),
    });
    dispatch({ type: "RESET_UPDATE_STATE" });

    // Clear existing timeout if any
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set timeout to reset isUserGroupsUpdated after 2 seconds
    timeoutRef.current = setTimeout(() => {
      dispatch({ type: "SET_IS_USER_GROUPS_UPDATED", value: false });
    }, 2000);
  }

  function toggleGroup(groupID: string) {
    dispatch({ type: "TOGGLE_GROUP", groupID });
  }

  function checkAllGroups() {
    dispatch({ type: "CHECK_ALL_GROUPS" });
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const description = props.isManaging
    ? mergedTexts.managingDescription
    : mergedTexts.description;

  return (
    <main className={cn("container mx-auto min-h-screen p-3 md:p-5", className?.container)}>
      <h1 className="text-2xl font-semibold text-black md:text-3xl lg:text-4xl xl:text-5xl dark:text-neutral-100">
        {mergedTexts.title}
      </h1>

      <div className={cn("md:pt8 relative z-0 mt-6 overflow-hidden rounded-2xl bg-white px-3 pt-6 pb-3 md:px-5 md:pb-5 dark:bg-neutral-800", className?.header)}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-6">
          <div className={className?.groupsContainer}>
            <NotificationHeader
              projectName={props.projectName}
              projectLogo={props.projectLogo}
              projectLogoDark={props.projectLogoDark}
              description={description}
              className={className}
            />

            {props.groups && (
              <NotificationGroupsList
                groups={props.groups}
                groupsChecked={state.groupChecked}
                hiddenGroupIds={hiddenGroupIds}
                isManaging={props.isManaging}
                onToggle={toggleGroup}
                onCheckAll={checkAllGroups}
                onUpdate={updateGroups}
                isUpdating={isUpdating}
                wasChanged={state.wasChanged}
                isUserGroupsUpdated={state.isUserGroupsUpdated}
                className={className}
                texts={mergedTexts}
              />
            )}
          </div>
          <div className="hidden md:inline"></div>
          {props.isManaging !== true && (
            <AddUserToGroups
              slug={slug}
              groupsChecked={state.groupChecked}
              showPhoneInput={showPhoneInput}
              agreementText={mergedTexts.agreementText}
              className={className}
              texts={mergedTexts}
            />
          )}
          {props.isManaging === true && props.userID != null && (
            <ManageMyData
              slug={slug}
              userID={props.userID}
              className={className}
              texts={mergedTexts}
            />
          )}

          <QRCodeSection
            showQRCode={showQRCode}
            isManaging={props.isManaging}
            className={className}
            texts={mergedTexts}
          />
        </div>
      </div>
    </main>
  );
}

function Wrapper(props: NotificationsComponentPublicProps) {
  return (
    <RpcProvider>
      <NotificationsComponentPublic {...props} />
    </RpcProvider>
  );
}
export default Wrapper;
