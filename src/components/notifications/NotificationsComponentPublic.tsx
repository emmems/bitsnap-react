import { useReducer, useRef, useEffect, useState } from "react";
import { cn } from "@/src/lib/utils";
import {
  rpcProvider,
  RpcProvider,
  useMutation,
  useQuery,
} from "src/rpc-provider";
import { useQuery as UQ, useQueryClient } from "@tanstack/react-query";
import { Settings, X } from "lucide-react";
import type {
  NotificationsComponentPublicProps,
  NotificationGroup,
  CustomizationTexts,
  ComponentClassNames,
  PublicNotificationGroup,
} from "./types";
export type {
  NotificationGroup,
  CustomizationTexts,
  ComponentClassNames,
} from "./types";
export type Props = NotificationsComponentPublicProps;
import { DEFAULT_TEXTS } from "./constants";
import { NotificationHeader } from "./NotificationHeader";
import { NotificationGroupsList } from "./NotificationGroupsList";
import { QRCodeSection } from "./QRCodeSection";
import { AddUserToGroups } from "./AddUserToGroups";
import { ManageMyData } from "./ManageMyData";
import { LoginScreen } from "./LoginScreen";
import { Button } from "@/src/ui/button";
import { getProjectID } from "../checkout/CartProvider";
import { NotificationGroupHowOften } from "@/src/gen/proto/common/v1/push_notifications_pb";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Spinner } from "@/src/ui/spinner";

interface State {
  isLoading: boolean;
  isUserGroupsUpdated: boolean;
  wasChanged: boolean;
  groupsProvided?: PublicNotificationGroup[];
  groups: NotificationGroup[];
  showSettings: boolean;
  isLoggedIn: boolean;
  userID: string | undefined;
}

type Action =
  | { type: "SET_IS_LOGGED_IN"; value: boolean }
  | { type: "SET_USER_ID"; value: string | undefined }
  | { type: "SET_LOADING"; value: boolean }
  | { type: "TOGGLE_GROUP"; groupID: string }
  | { type: "CHECK_ALL_GROUPS" }
  | { type: "SET_WAS_CHANGED"; value: boolean }
  | { type: "SET_IS_USER_GROUPS_UPDATED"; value: boolean }
  | { type: "RESET_UPDATE_STATE" }
  | { type: "SHOW_SETTINGS" }
  | { type: "SET_GROUPS"; value: NotificationGroup[] }
  | { type: "SET_PUBLIC_GROUPS"; value?: PublicNotificationGroup[] }
  | { type: "HIDE_SETTINGS" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_IS_LOGGED_IN": {
      return {
        ...state,
        isLoggedIn: action.value,
      };
    }
    case "SET_USER_ID": {
      return {
        ...state,
        userID: action.value,
      };
    }
    case "SET_LOADING": {
      return {
        ...state,
        isLoading: action.value,
      };
    }
    case "SET_PUBLIC_GROUPS": {
      return {
        ...state,
        groupsProvided: action.value,
        groups:
          action.value != null && action.value.length > 0
            ? state.groups.filter(
                (group) => action.value?.find((g) => g.id === group.id) != null
              )
            : state.groups,
      };
    }
    case "SET_GROUPS": {
      const isDefaultOn =
        state.isLoggedIn == false || state.groupsProvided != null;
      const newGroupsWithIsOn = action.value.map((group) => {
        if (state.isLoggedIn == true) {
          return group;
        }
        return {
          ...group,
          isOn:
            state.groupsProvided?.find((g) => g.id === group.id)?.isOn ??
            isDefaultOn,
        };
      });

      return {
        ...state,
        groups: newGroupsWithIsOn,
      };
    }
    case "TOGGLE_GROUP": {
      const updatedGroups = state.groups.map((group) => {
        if (group.id === action.groupID) {
          return {
            ...group,
            isOn: !group.isOn,
          };
        }
        return group;
      });
      return {
        ...state,
        wasChanged: true,
        groups: updatedGroups,
      };
    }
    case "CHECK_ALL_GROUPS": {
      const updated = state.groups.map((group) => {
        return {
          ...group,
          isOn: true,
        };
      });
      return {
        ...state,
        groups: updated,
        wasChanged: true,
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
    case "SHOW_SETTINGS":
      return {
        ...state,
        showSettings: true,
      };
    case "HIDE_SETTINGS":
      return {
        ...state,
        showSettings: false,
      };
    default:
      return state;
  }
}

function NotificationsComponentPublic(
  props: NotificationsComponentPublicProps
) {
  const [parent] = useAutoAnimate();
  let slug =
    props.slug ??
    getProjectID() ??
    (typeof window !== "undefined" ? window.location.hostname : "");

  const { mutateAsync: updateUserGroups, isPending: isUpdating } = useMutation(
    rpcProvider.notifications.updateUserGroups
  );

  const { data: userInfo, refetch: refetchAccessToken } = UQ({
    queryKey: ["notifications_accessToken"],
    queryFn: () => {
      if (typeof window !== "undefined") {
        return {
          accessToken:
            localStorage.getItem("notifications_accessToken") ?? undefined,
          userID: localStorage.getItem("notifications_userID") ?? undefined,
        };
      }
      return undefined;
    },
  });

  const {
    data: groupsDownloaded,
    isPending: isGroupsDownloading,
    refetch: refetchGroups,
  } = useQuery(rpcProvider.notifications.getUserGroups, {
    slug: slug,
    accessToken: userInfo?.accessToken,
  });

  const [state, dispatch] = useReducer(reducer, {
    isLoading: isGroupsDownloading,
    isUserGroupsUpdated: false,
    wasChanged: false,
    groupsProvided: props.groups,
    groups: [],
    showSettings: userInfo != null && props.isManaging == true,
    isLoggedIn: userInfo != null,
    userID: undefined,
  });

  useEffect(() => {
    dispatch({ type: "SET_LOADING", value: isUpdating || isGroupsDownloading });
  }, [isUpdating, isGroupsDownloading]);

  useEffect(() => {
    dispatch({
      type: "SET_IS_LOGGED_IN",
      value: userInfo?.accessToken != null,
    });
    dispatch({ type: "SET_USER_ID", value: userInfo?.userID });
    if (userInfo?.accessToken != null && props.isManaging == true) {
      dispatch({ type: "SHOW_SETTINGS" });
    }
  }, [userInfo, props.isManaging]);

  useEffect(() => {
    if (groupsDownloaded == null) {
      return;
    }
    let newGroups = groupsDownloaded.groups.map((group) => {
      let howOften = "rarely";
      switch (group.howOften) {
        case NotificationGroupHowOften.RARELY:
          howOften = "rarely";
          break;
        case NotificationGroupHowOften.OFTEN:
          howOften = "often";
          break;
        case NotificationGroupHowOften.VERY_OFTEN:
          howOften = "veryOften";
          break;
      }
      return {
        id: group.id,
        name: group.name,
        description: group.description,
        howOften: howOften,
        isOn: group.isOn ?? undefined,
      };
    });
    dispatch({ type: "SET_GROUPS", value: newGroups });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsDownloaded, isGroupsDownloading, props.groups]);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let preparedGroups = props.groups?.map((el) => {
      if (el.id.startsWith("group_")) {
        return el;
      }
      el.id = `group_${el.id}`;
      return el;
    });

    dispatch({ type: "SET_PUBLIC_GROUPS", value: preparedGroups });
  }, [props.groups]);

  const {
    texts,
    showQRCode = false,
    showPhoneInput = false,
    hiddenGroupIds = [],
    className,
  } = props;

  const mergedTexts = { ...DEFAULT_TEXTS, ...texts };

  async function updateGroups() {
    await updateUserGroups({
      accessToken: userInfo?.accessToken,
      slug: slug,
      userId: props.userID,
      groupIds: state.groups
        .filter((el) => el.isOn === true)
        .map((el) => el.id),
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

  function handleSettingsClick() {
    dispatch({ type: "SHOW_SETTINGS" });
  }

  function handleCloseSettings() {
    dispatch({ type: "HIDE_SETTINGS" });
  }

  function handleLogout() {
    localStorage.removeItem("notifications_accessToken");
    localStorage.removeItem("notifications_userID");
    refetchAccessToken();
    dispatch({ type: "SET_USER_ID", value: undefined });
    dispatch({ type: "SET_IS_LOGGED_IN", value: false });
    dispatch({ type: "HIDE_SETTINGS" });
  }

  async function handleLoginSuccess(
    userID: string | undefined,
    accessToken: string
  ) {
    if (typeof window !== "undefined") {
      localStorage.setItem("notifications_accessToken", accessToken);
      if (userID != null) {
        localStorage.setItem("notifications_userID", userID);
      }
    }
    dispatch({ type: "SET_USER_ID", value: userID });
    try {
      await refetchAccessToken();
      refetchGroups()
        .then()
        .catch()
        .finally(() => {
          if (props.isManaging == true) {
            // Automatically switch to managing view
            dispatch({ type: "SHOW_SETTINGS" });
          }
        });
    } catch (e) {
      console.log(`Error: ${e}`);
    }
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const isManagingEnabled =
    props.isManaging == true &&
    state.userID != null &&
    userInfo?.accessToken != null;

  return (
    <main className={cn("bitsnap-checkout relative", className?.container)}>
      {mergedTexts.title != null && (
        <h1 className="text-2xl font-semibold text-black md:text-3xl lg:text-4xl xl:text-5xl dark:text-neutral-100">
          {mergedTexts.title}
        </h1>
      )}

      {/* Floating Settings Icon */}
      {!state.showSettings && props.isManaging && (
        <Button
          onClick={handleSettingsClick}
          variant="outline"
          size="icon"
          className="absolute bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg hover:shadow-xl md:bottom-8 md:right-8"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </Button>
      )}

      <div
        className={cn(
          "md:pt8 relative z-0 mt-6 overflow-hidden rounded-2xl bg-white px-3 pt-6 pb-3 md:px-5 md:pb-5 dark:bg-neutral-800",
          className?.header
        )}
      >
        {state.showSettings ? (
          // Settings View
          <div className="space-y-6">
            {state.isLoggedIn && (
              // Managing Groups View (logged in)
              <div
                className={cn(
                  "grid grid-cols-1 gap-3 lg:gap-6",
                  isManagingEnabled ? "md:grid-cols-2" : ""
                )}
              >
                <div className={className?.groupsContainer}>
                  <NotificationHeader
                    projectName={props.projectName}
                    projectLogo={props.projectLogo}
                    projectLogoDark={props.projectLogoDark}
                    description={mergedTexts.managingDescription}
                    className={className}
                    onLogout={handleLogout}
                  />
                  {isGroupsDownloading && (
                    <div className="flex justify-center items-center py-8">
                      <Spinner />
                    </div>
                  )}

                  <NotificationGroupsList
                    groups={state.groups}
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
                </div>
                {isManagingEnabled && (
                  <ManageMyData
                    accessToken={userInfo.accessToken ?? ""}
                    slug={slug}
                    userID={state.userID ?? ""}
                    className={className}
                    texts={mergedTexts}
                  />
                )}

                {showQRCode != false && (
                  <QRCodeSection
                    showQRCode={showQRCode}
                    isManaging={true}
                    className={className}
                    texts={mergedTexts}
                  />
                )}
              </div>
            )}
          </div>
        ) : (
          // Default View (Form only)
          <div className={cn("grid grid-cols-1 gap-3 lg:gap-6")}>
            <AddUserToGroups
              slug={slug}
              onToggle={(id) => {
                dispatch({ type: "TOGGLE_GROUP", groupID: id });
              }}
              onCheckAll={() => {
                dispatch({ type: "CHECK_ALL_GROUPS" });
              }}
              onSuccess={(userAlreadyExists, userID, accessToken) => {
                if (accessToken != null) {
                  handleLoginSuccess(userID, accessToken);
                }
                if (userAlreadyExists) {
                  dispatch({ type: "SHOW_SETTINGS" });
                }
              }}
              groups={state.groups}
              showPhoneInput={showPhoneInput}
              agreementText={mergedTexts.agreementText}
              className={className}
              texts={mergedTexts}
              wasChanged={state.wasChanged}
              isUpdating={isUpdating}
            />
          </div>
        )}
      </div>
      <LoginScreen
        isOpen={state.showSettings && !state.isLoggedIn}
        slug={slug}
        onSuccess={handleLoginSuccess}
        texts={mergedTexts}
        onClose={handleCloseSettings}
      />
    </main>
  );
}

function Wrapper(props: Props) {
  return (
    <RpcProvider>
      <NotificationsComponentPublic {...props} />
    </RpcProvider>
  );
}
export default Wrapper;
